// Property-based tests (design 8.1: fast-check). These check laws that must hold for every
// input, not just the cases someone remembered to write down.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { signEnvelope, decodePayload } from "./envelope";
import type { Envelope } from "./envelope";
import { verifyCredential } from "./verify";
import { evaluateEligibility } from "./rules3v";
import type { RuleNode } from "./envelope";
import demoKeys from "../generated/demo-keys.json";
import registryJson from "../generated/demo-registry.json";
import type { RegistryPayload } from "./envelope";

const issuer = (demoKeys as unknown as { issuer: { kid: string; publicKey: string; privateKey: string; epoch: number } }).issuer;
const registry = decodePayload<RegistryPayload>(registryJson as unknown as Envelope);

const now = 1_790_000_000;

function credential(overrides: Record<string, unknown> = {}) {
  return {
    id: "01a1ac96-0000-7000-8000-000000000001",
    iss: issuer.kid,
    epoch: issuer.epoch,
    sub: "01a1ac96-0000-7000-8000-000000000002",
    skill: "TAILOR.L2",
    level: 2,
    ev: "0".repeat(64),
    iat: now - 3600,
    exp: now + 86_400,
    ...overrides,
  };
}

function signed(payload: Record<string, unknown>): Envelope {
  return signEnvelope({
    typ: "cred",
    privateKey: issuer.privateKey,
    publicKey: issuer.publicKey,
    payload: payload as never,
  });
}

describe("signed envelope", () => {
  it("round-trips any payload exactly", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (extra) => {
        const payload = credential(extra);
        const envelope = signed(payload);
        const decoded = decodePayload<Record<string, unknown>>(envelope);
        expect(decoded).toMatchObject(payload);
      }),
      { numRuns: 40 },
    );
  });

  it("rejects any single-byte change to the payload", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), (index) => {
        const envelope = signed(credential());
        const payload = decodePayload<Record<string, unknown>>(envelope);
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        const at = index % bytes.length;
        const mutated = new Uint8Array(bytes);
        mutated[at] = mutated[at] === 0x7b ? 0x7d : mutated[at] + 1;
        const altered: Envelope = {
          ...envelope,
          payload: btoa(String.fromCharCode(...mutated)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
        };
        let status = "THREW";
        try {
          status = verifyCredential(altered, registry, now).status;
        } catch {
          status = "THREW";
        }
        expect(status).not.toBe("VALID");
      }),
      { numRuns: 40 },
    );
  });

  it("rejects a credential signed by a different key", () => {
    const other = (demoKeys as unknown as { sponsor: { privateKey: string; publicKey: string } }).sponsor;
    const forged = signEnvelope({
      typ: "cred",
      privateKey: other.privateKey,
      publicKey: other.publicKey,
      payload: credential() as never,
    });
    expect(verifyCredential(forged, registry, now).status).not.toBe("VALID");
  });
});

describe("three-valued eligibility", () => {
  const criteria: RuleNode = {
    all: [
      { id: "c1", logic: { ">=": [{ var: "class_level" }, 11] }, needs: ["class_level"] },
      { id: "c2", logic: { "==": [{ var: "category" }, "OBC"] }, needs: ["category"] },
    ],
  };

  it("never decides while a needed field is missing", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 8, max: 12 }), { nil: undefined }),
        fc.option(fc.constantFrom("OBC", "SC", "ST", "OPEN"), { nil: undefined }),
        (classLevel, category) => {
          const profile: Record<string, unknown> = {};
          if (classLevel !== undefined) profile.class_level = classLevel;
          if (category !== undefined) profile.category = category;
          const result = evaluateEligibility(criteria, profile, {}, []);
          const categoryFails = category !== undefined && category !== "OBC";
          const classFails = classLevel !== undefined && classLevel < 11;
          if (categoryFails || classFails) {
            // A definite failure always wins over missing information.
            expect(result.outcome).toBe("NOT_ELIGIBLE");
          } else if (classLevel === undefined || category === undefined) {
            expect(result.outcome).toBe("NEED_INFO");
            expect(result.missing.length).toBeGreaterThan(0);
          } else {
            expect(result.outcome).toBe("ELIGIBLE");
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it("names the first failing rule instead of guessing", () => {
    expect(evaluateEligibility(criteria, { class_level: 12, category: "SC" }, {}, []).rule).toBe("c2");
  });
});
