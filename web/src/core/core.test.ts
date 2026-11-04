import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import packJson from "../generated/demo-pack.json";
import registryJson from "../generated/demo-registry.json";
import demoKeys from "../generated/demo-keys.json";
import trustJson from "../generated/trust.json";
import type { CredentialPayload, Envelope, PackPayload, RegistryPayload } from "./envelope";
import { ROOT_KID, decodePayload, signEnvelope, verifyPack } from "./envelope";
import { canonicalJson } from "./crypto";
import { evaluateEligibility, expectationMatches } from "./rules3v";
import { buildBloom, mightContain } from "./bloom";
import { rankCareers, scoreCareer, type LearnerProfile } from "./scoring";
import { verifyCredential, verifyRegistry } from "./verify";
import { compareVersions } from "../data/packs";
import { pathwayView } from "./pathway";
import { uuidv7 } from "./ids";

const packEnvelope = packJson as unknown as Envelope;
const registryEnvelope = registryJson as unknown as Envelope;
const pack = decodePayload<PackPayload>(packEnvelope);
const registry = decodePayload<RegistryPayload>(registryEnvelope);

const vectorsPath = resolve(process.cwd(), "../packs/vectors/eligibility.json");
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
  pack_version: string;
  cases: { scheme_id: string; criteria: unknown; profile: Record<string, unknown>; expect: string }[];
};

describe("signed packs", () => {
  it("verifies the bundled pack and every manifest section", () => {
    const result = verifyPack(packEnvelope);
    expect(result.ok).toBe(true);
    expect(result.payload?.schemes).toHaveLength(10);
    expect(result.payload?.reviewers.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a tampered payload byte", () => {
    const payload = JSON.parse(JSON.stringify(packEnvelope)) as Envelope;
    const bytes = Buffer.from(payload.payload, "base64url");
    bytes[10] ^= 0xff;
    payload.payload = bytes.toString("base64url");
    expect(verifyPack(payload).ok).toBe(false);
  });

  it("rejects a changed section even when the envelope signature is intact", () => {
    const fixture = readFileSync(resolve(process.cwd(), "../packs/vectors/tampered-section.json"), "utf8");
    const result = verifyPack(JSON.parse(fixture) as Envelope);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("section_hash_mismatch:schemes");
  });

  it("rejects a flipped signature byte", () => {
    const fixture = readFileSync(resolve(process.cwd(), "../packs/vectors/tampered-signature.json"), "utf8");
    expect(verifyPack(JSON.parse(fixture) as Envelope).errors).toContain("bad_signature");
  });

  it("pins the root key that signed the pack key certificate", () => {
    const trust = trustJson as { root_kid: string; keys: Record<string, { public_key: string }> };
    expect(trust.root_kid).toBe(ROOT_KID);
    expect(trust.keys[ROOT_KID].public_key.length).toBeGreaterThan(40);
    expect(registryEnvelope.kid).toBe(ROOT_KID);
    expect(pack.signer.root_sig.length).toBeGreaterThan(40);
  });
});

describe("three-valued eligibility", () => {
  it("matches every shared golden vector", () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(30);
    for (const testCase of vectors.cases) {
      const result = evaluateEligibility(testCase.criteria as never, testCase.profile);
      if (!expectationMatches(testCase.expect, result)) {
        throw new Error(
          `${testCase.scheme_id} expected ${testCase.expect}, got ${result.outcome}:${result.rule ?? ""}:${result.missing.join(",")}`,
        );
      }
    }
  });

  it("returns NEED_INFO with the union of missing fields, not a silent yes", () => {
    const scheme = pack.schemes.find((s) => s.id === "MINORITY-PMS")!;
    const result = evaluateEligibility(scheme.criteria, { class_level: 11, family_income: 100000 });
    expect(result.outcome).toBe("NEED_INFO");
    expect(result.missing).toEqual(["marks_percent", "minority"]);
  });

  it("treats low-confidence fields as unknown", () => {
    const scheme = pack.schemes.find((s) => s.id === "EBC-GIRLS-MH")!;
    const result = evaluateEligibility(
      scheme.criteria,
      { gender: "female", class_level: 11, family_income: 90000 },
      { gender: 0.3 },
    );
    expect(result.outcome).toBe("NEED_INFO");
    expect(result.missing).toContain("gender");
  });

  it("cites the first failing rule", () => {
    const scheme = pack.schemes.find((s) => s.id === "PMS-OBC-MH")!;
    const result = evaluateEligibility(scheme.criteria, { class_level: 11, category: "SC", family_income: 90000 });
    expect(result.outcome).toBe("NOT_ELIGIBLE");
    expect(result.rule).toBe("c2");
  });
});

describe("canonical json", () => {
  it("sorts keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: "x" } })).toBe('{"a":{"c":"x","d":[2,1]},"b":1}');
  });
});

describe("bloom revocation set", () => {
  it("has no false negatives and reports positives for members", () => {
    const filter = buildBloom(["cred-a", "cred-b", "cred-c"]);
    expect(mightContain(filter, "cred-a")).toBe(true);
    expect(mightContain(filter, "cred-b")).toBe(true);
    expect(mightContain(filter, "cred-zzz")).toBe(false);
  });

  it("ships a sized filter in the registry", () => {
    expect(registry.bloom.m).toBeGreaterThan(1000);
    expect(mightContain(registry.bloom, "revoked-demo-0001")).toBe(true);
  });
});

describe("offline credential verification", () => {
  const issuer = (demoKeys as { issuer: { privateKey: string; publicKey: string; kid: string; epoch: number } }).issuer;
  const now = Math.floor(Date.now() / 1000);

  function credential(overrides: Partial<CredentialPayload> = {}): Envelope {
    const payload: CredentialPayload = {
      id: "test-cred-0001",
      iss: issuer.kid,
      epoch: issuer.epoch,
      sub: "student-1",
      skill: "TAILOR.L2",
      level: 2,
      ev: "a".repeat(64),
      iat: now,
      exp: now + 86_400,
      ...overrides,
    };
    return signEnvelope({ privateKey: issuer.privateKey, publicKey: issuer.publicKey, typ: "cred", payload });
  }

  it("accepts a valid credential and reports registry age", () => {
    const result = verifyCredential(credential(), registry);
    expect(result.status).toBe("VALID");
    expect(result.issuer?.org).toContain("demo");
    expect(result.registryAgeDays).not.toBeNull();
  });

  it("rejects a mutated payload", () => {
    const envelope = credential();
    const bytes = Buffer.from(envelope.payload, "base64url");
    bytes[bytes.length - 2] ^= 0xff;
    envelope.payload = bytes.toString("base64url");
    expect(verifyCredential(envelope, registry).status).toBe("INVALID");
  });

  it("rejects an expired credential", () => {
    expect(verifyCredential(credential({ exp: now - 60 }), registry).status).toBe("INVALID");
  });

  it("rejects a fenced epoch", () => {
    expect(verifyCredential(credential({ epoch: 1 }), registry).reasons).toContain("fenced_by_epoch");
  });

  it("rejects a skill outside the issuer scope", () => {
    expect(verifyCredential(credential({ skill: "SURGERY.L9" }), registry).reasons).toContain(
      "outside_issuer_scope",
    );
  });

  it("rejects an unknown issuer", () => {
    const forged = signEnvelope({
      privateKey: issuer.privateKey,
      publicKey: issuer.publicKey,
      typ: "cred",
      payload: { id: "x", iss: "not-a-kid", epoch: 9, sub: "s", skill: "TAILOR.L2", level: 2, ev: "e", iat: now, exp: now + 100 },
    });
    expect(verifyCredential(forged, registry).status).toBe("INVALID");
  });

  it("marks the exact revoked credential invalid", () => {
    const result = verifyCredential(credential({ id: "revoked-demo-0001" }), registry);
    expect(result.status).toBe("INVALID");
    expect(result.reasons).toContain("revoked");
  });
});

describe("registry", () => {
  it("verifies the root signature and issuer certificates", () => {
    const result = verifyRegistry(registryEnvelope);
    expect(result.ok).toBe(true);
    expect(result.registry?.issuers.length).toBe(2);
    expect(result.registry?.epoch).toBe(3);
  });
});

describe("career discovery", () => {
  const profile: LearnerProfile = {
    values: { education_level: "CLASS_10", marks_percent: 68, age: 15 },
    confidence: {},
    interests: ["tailoring", "design", "fabric"],
    skills: ["stitching", "measurement"],
  };

  it("scores tailoring highest for a tailoring profile", () => {
    const careers = pack.catalogue.careers;
    const ranked = rankCareers(careers, profile);
    expect(ranked[0].career.id).toBe("tailor-master");
    expect(scoreCareer(ranked[0].career, profile).score).toBeGreaterThan(0.4);
  });

  it("shows at least three clusters in the top six when they exist", () => {
    const ranked = rankCareers(pack.catalogue.careers, profile, 6);
    expect(new Set(ranked.map((item) => item.career.cluster)).size).toBeGreaterThanOrEqual(3);
  });
});

describe("pathway", () => {
  it("unlocks only steps whose prerequisites are recorded", () => {
    const steps = pack.pathways["tailor-master"];
    const view = pathwayView(steps, new Set(["tailor-master.s1"]));
    expect(view[0].state).toBe("done");
    expect(view[1].state).toBe("available");
    expect(view[2].state).toBe("locked");
  });
});

describe("ids and versions", () => {
  it("orders UUIDv7 ids by time", () => {
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_800_000_000_000);
    expect(earlier < later).toBe(true);
  });

  it("compares pack versions", () => {
    expect(compareVersions("2026.11.20-1", "2026.10.14-1")).toBe(1);
    expect(compareVersions("2026.09.01-1", "2026.10.14-1")).toBe(-1);
    expect(compareVersions("2026.10.14-1", "2026.10.14-1")).toBe(0);
  });
});
