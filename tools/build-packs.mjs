// Builds every signed artifact the prototype ships:
//   * rules-mh pack (three versions, so the demo can show a newer pack arriving by file)
//   * registry snapshot with issuer certs, epoch and a Bloom revocation set
//   * shared eligibility vectors for the TypeScript and Java test suites
// Fails the build if any golden expectation disagrees with the reference evaluator.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  b64u,
  canonicalJson,
  sectionHash,
  sha256Hex,
  signEnvelope,
  utf8,
  verifyEnvelope,
  verifyPack,
} from "./lib/envelope.mjs";
import { buildBloom } from "./lib/bloom.mjs";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { evaluateEligibility, expectationMatches } from "./lib/rules3v.mjs";
import { schemes as baseSchemes } from "./seed/schemes.mjs";
import { careers, clusters, pathways } from "./seed/catalogue.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "packs");
const keysDoc = JSON.parse(readFileSync(join(here, "dev-keys.json"), "utf8"));
const K = keysDoc.keys;

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
const clone = (value) => JSON.parse(JSON.stringify(value));
const failures = [];

function assertGolden(scheme, versionLabel) {
  for (const [index, test] of scheme.golden.entries()) {
    const actual = evaluateEligibility(scheme.criteria, test.profile);
    if (!expectationMatches(test.expect, actual)) {
      failures.push(
        `${versionLabel} ${scheme.id} golden[${index}] expected ${test.expect}, got ${actual.outcome}${actual.rule ? `:${actual.rule}` : ""}${actual.missing.length ? ` missing=${actual.missing.join(",")}` : ""}`,
      );
    }
  }
}

function buildSchemes(version) {
  const schemes = clone(baseSchemes);
  if (version === "2026.09.01-1") {
    schemes.find((s) => s.id === "PMS-OBC-MH").criteria.all[2].logic = { "<=": [{ var: "family_income" }, 200000] };
    schemes.find((s) => s.id === "EBC-GIRLS-MH").deadline = "2026-11-30";
  }
  if (version === "2026.11.20-1") {
    const obc = schemes.find((s) => s.id === "PMS-OBC-MH");
    obc.criteria.all[2].logic = { "<=": [{ var: "family_income" }, 300000] };
    obc.deadline = "2027-01-15";
    obc.source = { ...obc.source, verified: "2026-11-18" };
    // The revised ceiling changes an outcome: that is exactly what a new signed pack must show.
    obc.golden = [
      { profile: { class_level: 11, category: "OBC", family_income: 280000 }, expect: "ELIGIBLE" },
      { profile: { class_level: 11, category: "SC", family_income: 180000 }, expect: "NOT:c2" },
      { profile: { class_level: 11, category: "OBC", family_income: 350000 }, expect: "NOT:c3" },
      { profile: {}, expect: "NEED:[category,class_level,family_income]" },
    ];
    schemes.find((s) => s.id === "PMKVY-SHORT").documents = ["aadhaar_optional", "bank_passbook", "photo", "training_centre_slip"];
  }
  for (const scheme of schemes) assertGolden(scheme, version);
  return schemes;
}

function audioIndex(schemes) {
  return schemes.map((s) => ({
    id: s.family_voice.clip,
    scheme_id: s.id,
    language: "hi",
    transcript: s.family_voice.hi,
    transcript_en: s.family_voice.en,
    delivery: "device-tts",
  }));
}

function buildPack(version, issuedAt, expiresAt, reviewerKids) {
  const schemes = buildSchemes(version);
  const golden = Object.fromEntries(schemes.map((s) => [s.id, s.golden]));
  const payload = {
    name: "schemes-mh",
    version,
    issued_at: issuedAt,
    expires_at: expiresAt,
    reviewers: reviewerKids,
    signer: {
      kid: K.pack.kid,
      role: "pack",
      pubkey: K.pack.publicKey,
      root_sig: b64u.encode(
        signBytes({
          privateKey: K.root.privateKey,
          bytes: canonicalJson({ kid: K.pack.kid, pubkey: K.pack.publicKey, role: "pack" }),
        }),
      ),
    },
    manifest: [],
    schemes,
    catalogue: { clusters, careers },
    pathways,
    audio: audioIndex(schemes),
    golden,
    meta: {
      locale: ["hi", "mr", "en"],
      demo: true,
      review_status: "DEMO_REVIEWED",
      note: "Criteria encoded from public scheme pages for the hackathon demo. Official verification is pending; every result shows its source and last-verified date.",
    },
  };
  for (const file of ["schemes", "catalogue", "pathways", "audio", "golden"]) {
    payload.manifest.push({ file, sha256: sectionHash(payload[file]) });
  }

  const envelope = signEnvelope({ privateKey: K.pack.privateKey, publicKey: K.pack.publicKey, typ: "pack", payload });
  return envelope;
}

// Small local Ed25519 helper that ignores envelope framing (used for the root-signed key cert).
function signBytes({ privateKey, bytes }) {
  return ed.sign(utf8(bytes), b64u.decode(privateKey));
}

function issuerCert(role, org, scope, validFrom, validTo) {
  const key = K[role];
  const cert = {
    kid: key.kid,
    org,
    role: "FACILITATOR",
    scope,
    epoch: 3,
    valid_from: validFrom,
    valid_to: validTo,
    pubkey: key.publicKey,
  };
  cert.root_sig = b64u.encode(signBytes({ privateKey: K.root.privateKey, bytes: canonicalJson(cert) }));
  return cert;
}

function buildRegistry() {
  const issuers = [
    issuerCert("issuer-hub-1", "Zilla Parishad Skills Cell (demo)", ["TAILOR.L1", "TAILOR.L2", "WELD.L1"], "2026-01-01", "2026-12-31"),
    issuerCert("issuer-hub-2", "NGO Learning Centre (demo)", ["TAILOR.L2", "BEAUTY.L1"], "2026-04-01", "2026-12-31"),
  ];
  const revoked = [
    { cred_id: "revoked-demo-0001", revoked_at: "2026-10-02", reason: "issued in error", epoch: 3 },
  ];
  const payload = {
    version: "registry-2026.10.14-3",
    epoch: 3,
    issued_at: "2026-10-14",
    valid_to: "2026-12-31",
    synced_at: "2026-10-14T06:00:00Z",
    issuers,
    revoked,
    // Sized for a 2,000-credential revocation window at p=1%; a negative is definitive.
    bloom: { ...buildBloom(revoked.map((r) => r.cred_id), 2000), capacity: 2000 },
    note: "Signed registry snapshot. A Bloom negative is definitive; a positive means possibly revoked.",
  };
  return signEnvelope({ privateKey: K.root.privateKey, publicKey: K.root.publicKey, typ: "registry", payload });
}

function verifyPackFile(file) {
  const envelope = JSON.parse(readFileSync(file, "utf8"));
  const result = verifyPack(envelope, { [K.pack.kid]: K.pack.publicKey });
  if (!result.ok) failures.push(`${file}: ${result.errors.join(", ")}`);
  if (result.payload) {
    for (const entry of result.payload.manifest) {
      if (sectionHash(result.payload[entry.file]) !== entry.sha256) failures.push(`${file}: manifest ${entry.file}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------- build
mkdirSync(out, { recursive: true });
const packDir = join(out, "schemes-mh");
mkdirSync(packDir, { recursive: true });
rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });

const versions = [
  { version: "2026.09.01-1", issued: "2026-09-01", expires: "2026-09-30", reviewers: [K["reviewer-1"].kid, K["reviewer-2"].kid] },
  { version: "2026.10.14-1", issued: "2026-10-14", expires: "2026-11-13", reviewers: [K["reviewer-1"].kid, K["reviewer-3"].kid] },
  { version: "2026.11.20-1", issued: "2026-11-20", expires: "2026-12-19", reviewers: [K["reviewer-1"].kid, K["reviewer-2"].kid, K["reviewer-3"].kid] },
];

const built = [];
for (const entry of versions) {
  const envelope = buildPack(entry.version, entry.issued, entry.expires, entry.reviewers);
  const file = join(packDir, `${entry.version}.json`);
  writeFileSync(file, `${JSON.stringify(envelope, null, 2)}\n`);
  built.push({ ...entry, file: `schemes-mh/${entry.version}.json`, sha256: sha256Hex(readFileSync(file)) });
  verifyPackFile(file);
}

const registry = buildRegistry();
mkdirSync(join(out, "registry"), { recursive: true });
const registryFile = join(out, "registry", "registry-3.json");
writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
const registryCheck = verifyEnvelope(registry, { [K.root.kid]: K.root.publicKey });
if (!registryCheck.ok) failures.push(`registry: ${registryCheck.errors.join(", ")}`);

const current = built.find((b) => b.version === "2026.10.14-1");
writeFileSync(
  join(out, "latest.json"),
  `${JSON.stringify(
    {
      pack: { name: "schemes-mh", version: current.version, path: current.file, sha256: current.sha256 },
      registry: { version: registryCheck.payload.version, epoch: registryCheck.payload.epoch, path: "registry/registry-3.json" },
      generated_at: new Date().toISOString(),
      note: "Generated by tools/build-packs.mjs. Every path is signed.",
    },
    null,
    2,
  )}\n`,
);

// Shared vectors: both test suites read the same file.
const vectors = { pack_version: current.version, cases: [] };
for (const scheme of baseSchemes) {
  for (const test of scheme.golden) {
    vectors.cases.push({
      scheme_id: scheme.id,
      criteria: scheme.criteria,
      profile: test.profile,
      confidence: {},
      expect: test.expect,
    });
  }
}
mkdirSync(join(out, "vectors"), { recursive: true });
writeFileSync(join(out, "vectors", "eligibility.json"), `${JSON.stringify(vectors, null, 2)}\n`);

// Copy public artifacts to the PWA and the Spring static resources.
const webPacks = join(root, "web", "public", "packs");
rmSync(webPacks, { recursive: true, force: true });
mkdirSync(webPacks, { recursive: true });
mkdirSync(join(root, "web", "src", "generated"), { recursive: true });
writeFileSync(join(root, "web", "src", "generated", "trust.json"), `${JSON.stringify(JSON.parse(readFileSync(join(out, "trust.json"))), null, 2)}\n`);
for (const rel of ["latest.json", "registry/registry-3.json", ...built.map((b) => b.file)]) {
  const dest = join(webPacks, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(out, rel), dest);
}

if (failures.length > 0) {
  console.error("Pack build failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Built ${built.length} signed packs, registry epoch ${registryCheck.payload.epoch}, ${vectors.cases.length} golden cases.`);
console.log(`  public artifacts -> web/public/packs (${built.map((b) => b.version).join(", ")})`);
console.log(`  trust anchor     -> web/src/generated/trust.json (root kid ${K.root.kid})`);
