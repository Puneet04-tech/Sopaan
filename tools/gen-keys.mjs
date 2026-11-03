// Generates the DEV-ONLY keystore used by the demo pack builder.
// In production the root key stays offline and only signs issuer certs and the pack key.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveKey } from "./lib/envelope.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "dev-keys.json");

if (existsSync(target) && !process.argv.includes("--force")) {
  console.log("dev-keys.json already exists (pass --force to rotate). Existing public keys stay pinned.");
  process.exit(0);
}

const roles = ["root", "pack", "registry", "issuer-hub-1", "issuer-hub-2", "reviewer-1", "reviewer-2", "reviewer-3", "sponsor"];
const keys = {
  warning: "DEV ONLY — generated for the Sopaan prototype. Never ship these seeds. Rotate before any pilot.",
  generated_at: new Date().toISOString(),
  keys: {},
};

for (const role of roles) keys.keys[role] = deriveKey(randomBytes(32).toString("hex"));

writeFileSync(target, `${JSON.stringify(keys, null, 2)}\n`);
console.log(`Wrote ${target}`);
for (const [role, key] of Object.entries(keys.keys)) console.log(`  ${role.padEnd(12)} kid=${key.kid}  pub=${key.publicKey}`);

// Keep the public trust anchor readable without the private half.
const trust = {
  note: "Public trust anchors for the Sopaan demo. Replace with production keys.",
  root_kid: keys.keys.root.kid,
  keys: Object.fromEntries(
    Object.entries(keys.keys).map(([role, key]) => [
      key.kid,
      { role, public_key: key.publicKey },
    ]),
  ),
};
writeFileSync(join(here, "..", "packs", "trust.json"), `${JSON.stringify(trust, null, 2)}\n`);
console.log("Wrote packs/trust.json");
