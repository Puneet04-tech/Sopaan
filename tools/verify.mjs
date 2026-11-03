#!/usr/bin/env node
// Standalone verifier: proves a third party can check Sopaan artifacts without our backend.
// Usage:
//   node tools/verify.mjs <file.json> [--registry packs/registry/registry-3.json]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { b64u, canonicalJson, text, verifyEnvelope, verifyPack } from "./lib/envelope.mjs";
import { bloomMightContain } from "./lib/bloom.mjs";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const here = dirname(fileURLToPath(import.meta.url));
const trust = JSON.parse(readFileSync(join(here, "..", "packs", "trust.json"), "utf8"));
const rootKey = trust.keys[trust.root_kid].public_key;
const publicKeys = Object.fromEntries(Object.entries(trust.keys).map(([kid, v]) => [kid, v.public_key]));

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node tools/verify.mjs <artifact.json> [--registry <registry.json>]");
  process.exit(2);
}
const registryArg = args.includes("--registry") ? args[args.indexOf("--registry") + 1] : join(here, "..", "packs", "registry", "registry-3.json");

const artifact = JSON.parse(readFileSync(resolve(file), "utf8"));
const now = Math.floor(Date.now() / 1000);
const problems = [];
let ok = true;

function rootSignatureOk(record, signature) {
  try {
    return ed.verify(b64u.decode(signature), new TextEncoder().encode(canonicalJson(record)), b64u.decode(rootKey));
  } catch {
    return false;
  }
}

const envelope = artifact.envelope ?? artifact;

if (envelope.typ === "pack") {
  const result = verifyPack(envelope, publicKeys);
  ok = result.ok;
  problems.push(...result.errors);
  if (result.payload) {
    const signer = result.payload.signer;
    const cert = { kid: signer.kid, pubkey: signer.pubkey, role: signer.role };
    if (!rootSignatureOk(cert, signer.root_sig)) problems.push("pack_signer_not_root_signed");
    const expired = new Date(`${result.payload.expires_at}T23:59:59Z`).getTime() < Date.now();
    console.log(`pack ${result.payload.name}@${result.payload.version}`);
    console.log(`  sections : ${result.payload.manifest.map((m) => m.file).join(", ")}`);
    console.log(`  schemes  : ${result.payload.schemes.length}`);
    console.log(`  reviewers: ${result.payload.reviewers.length}/3`);
    console.log(`  expiry   : ${result.payload.expires_at}${expired ? " (STALE)" : ""}`);
    ok = ok && problems.length === 0;
  }
} else if (envelope.typ === "registry") {
  const result = verifyEnvelope(envelope, { [trust.root_kid]: rootKey });
  ok = result.ok;
  problems.push(...result.errors);
  if (result.payload) {
    console.log(`registry ${result.payload.version} epoch ${result.payload.epoch}`);
    for (const cert of result.payload.issuers) {
      const { root_sig, ...record } = cert;
      if (!rootSignatureOk(record, root_sig)) problems.push(`issuer_cert_bad:${cert.kid}`);
      console.log(`  issuer ${cert.kid} scope=${cert.scope.join(",")} valid_to=${cert.valid_to}`);
    }
    console.log(`  revoked: ${result.payload.revoked.length}, bloom m=${result.payload.bloom.m} k=${result.payload.bloom.k}`);
    ok = ok && problems.length === 0;
  }
} else if (envelope.typ === "cred") {
  const registryEnvelope = JSON.parse(readFileSync(resolve(registryArg), "utf8"));
  const registryCheck = verifyEnvelope(registryEnvelope, { [trust.root_kid]: rootKey });
  if (!registryCheck.ok) {
    console.error(`registry snapshot invalid: ${registryCheck.errors.join(", ")}`);
    process.exit(2);
  }
  const registry = registryCheck.payload;
  const cert = registry.issuers.find((i) => i.kid === envelope.kid);
  const payload = JSON.parse(text(b64u.decode(envelope.payload)));
  if (!cert) problems.push("unknown_issuer");
  else {
    const { root_sig, ...record } = cert;
    if (!rootSignatureOk(record, root_sig)) problems.push("issuer_cert_not_root_signed");
    if (!verifyEnvelope(envelope, { [cert.kid]: cert.pubkey }).ok) problems.push("bad_signature");
    if (payload.epoch < cert.epoch) problems.push("fenced_epoch");
    if (payload.iat < Date.parse(cert.valid_from) / 1000 || payload.iat > Date.parse(cert.valid_to) / 1000) {
      problems.push("outside_issuer_lease");
    }
  }
  if (now > payload.exp) problems.push("expired");
  if (bloomMightContain(registry.bloom, payload.id)) problems.push("possibly_revoked");
  ok = problems.length === 0;
  console.log(`credential ${payload.id}`);
  console.log(`  skill ${payload.skill} level ${payload.level} issuer ${payload.iss}`);
} else {
  const result = verifyEnvelope(envelope, publicKeys);
  ok = result.ok;
  problems.push(...result.errors);
  console.log(`${envelope.typ} envelope verified=${result.ok}`);
}

if (!ok || problems.length > 0) {
  console.log(`RESULT: INVALID (${[...new Set(problems)].join(", ")})`);
  process.exit(1);
}
console.log("RESULT: VALID");
