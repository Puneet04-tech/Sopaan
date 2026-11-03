// Shared envelope + crypto helpers. Mirrors web/src/core/{crypto,envelope}.ts and
// server/.../common/{Ed25519Signer,Envelope}.java. The signature covers the exact payload
// bytes, so no JSON canonicalisation is needed for the envelope itself.
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export const b64u = {
  encode(bytes) {
    return Buffer.from(bytes).toString("base64url");
  },
  decode(text) {
    return new Uint8Array(Buffer.from(text, "base64url"));
  },
};

export function utf8(text) {
  return new TextEncoder().encode(text);
}

export function text(bytes) {
  return new TextDecoder().decode(bytes);
}

export function sha256Hex(bytes) {
  const input = typeof bytes === "string" ? utf8(bytes) : bytes;
  return Buffer.from(sha256(input)).toString("hex");
}

/** Recursively sorted JSON: the one canonical form shared by JS, Java and Python. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function sectionHash(section) {
  return sha256Hex(canonicalJson(section));
}

export function kidFor(publicKeyBytes) {
  return b64u.encode(sha256(publicKeyBytes).slice(0, 8));
}

export function deriveKey(seedHex) {
  const seed = Buffer.from(seedHex, "hex");
  const publicKey = ed.getPublicKey(seed);
  const kid = kidFor(publicKey);
  return {
    seed: Buffer.from(seed).toString("hex"),
    publicKey: b64u.encode(publicKey),
    privateKey: b64u.encode(seed),
    kid,
  };
}

/** payload may be an object (serialised once) or raw bytes. */
export function signEnvelope({ privateKey, publicKey, typ, payload, version = 1 }) {
  const bytes = typeof payload === "string" || payload instanceof Uint8Array ? payload : utf8(canonicalJson(payload));
  const payloadBytes = typeof bytes === "string" ? utf8(bytes) : bytes;
  const sig = ed.sign(payloadBytes, b64u.decode(privateKey));
  return {
    v: version,
    kid: kidFor(b64u.decode(publicKey)),
    typ,
    payload: b64u.encode(payloadBytes),
    sig: b64u.encode(sig),
  };
}

export function verifyEnvelope(envelope, publicKeysByKid) {
  const errors = [];
  if (!envelope || typeof envelope !== "object") return { ok: false, errors: ["envelope_missing"] };
  if (envelope.v !== 1) errors.push("unsupported_version");
  if (!["pack", "cred", "registry", "event", "token", "allowance"].includes(envelope.typ)) {
    errors.push("unknown_typ");
  }
  const key = publicKeysByKid[envelope.kid];
  if (!key) return { ok: false, errors: [...errors, "unknown_kid"] };
  let ok = false;
  try {
    ok = ed.verify(b64u.decode(envelope.sig), b64u.decode(envelope.payload), b64u.decode(key));
  } catch {
    ok = false;
  }
  if (!ok) errors.push("bad_signature");
  return { ok: ok && errors.length === 0, errors, payload: ok ? JSON.parse(text(b64u.decode(envelope.payload))) : null };
}

/** A pack is verified on its envelope AND every section hash in the manifest. */
export function verifyPack(envelope, publicKeysByKid) {
  const result = verifyEnvelope(envelope, publicKeysByKid);
  if (!result.ok) return result;
  const pack = result.payload;
  const errors = [];
  for (const entry of pack.manifest ?? []) {
    const section = pack[entry.file];
    if (section === undefined) {
      errors.push(`section_missing:${entry.file}`);
      continue;
    }
    if (sectionHash(section) !== entry.sha256) errors.push(`section_hash_mismatch:${entry.file}`);
  }
  if (!pack.expires_at) errors.push("expiry_missing");
  return { ok: errors.length === 0, errors, payload: pack };
}
