// Ed25519 + SHA-256 in the browser. Same envelope bytes as the Java and Python runtimes:
// @noble/ed25519 and the JDK both sign/verify RFC 8032 raw keys.
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function b64uEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function sha256Bytes(input: Uint8Array | string): Uint8Array {
  return sha256(typeof input === "string" ? utf8(input) : input);
}

export function sha256Hex(input: Uint8Array | string): string {
  return Array.from(sha256Bytes(input))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Recursively sorted JSON. Mirrors tools/lib/envelope.mjs and Ed25519Signer.java. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function sectionHash(section: unknown): string {
  return sha256Hex(canonicalJson(section));
}

export function kidFor(publicKey: Uint8Array): string {
  return b64uEncode(sha256Bytes(publicKey).slice(0, 8));
}

export function randomSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

export function keypairFromSeed(seed: Uint8Array) {
  const publicKey = ed.getPublicKey(seed);
  return {
    privateKey: b64uEncode(seed),
    publicKey: b64uEncode(publicKey),
    kid: kidFor(publicKey),
  };
}

export function signBytes(payload: Uint8Array, privateKeyB64u: string): string {
  return b64uEncode(ed.sign(payload, b64uDecode(privateKeyB64u)));
}

export function verifyBytes(payload: Uint8Array, signatureB64u: string, publicKeyB64u: string): boolean {
  try {
    return ed.verify(b64uDecode(signatureB64u), payload, b64uDecode(publicKeyB64u));
  } catch {
    return false;
  }
}

/** WebCrypto wants an ArrayBuffer-backed view; @noble returns Uint8Array<ArrayBufferLike>. */
function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** PIN access control around a stored device key. PBKDF2-HMAC-SHA256, 210k iterations. */
export async function wrapWithPin(plaintext: string, pin: string): Promise<string> {
  const salt = bufferSource(randomSeed().slice(0, 16));
  const material = await crypto.subtle.importKey("raw", bufferSource(utf8(pin)), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = bufferSource(randomSeed().slice(0, 12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bufferSource(utf8(plaintext)));
  return JSON.stringify({
    alg: "PBKDF2-AESGCM",
    iterations: 210_000,
    salt: b64uEncode(new Uint8Array(salt)),
    iv: b64uEncode(new Uint8Array(iv)),
    data: b64uEncode(new Uint8Array(ciphertext)),
  });
}

export async function unwrapWithPin(wrapped: string, pin: string): Promise<string> {
  const box = JSON.parse(wrapped) as { salt: string; iv: string; data: string; iterations: number };
  const material = await crypto.subtle.importKey("raw", bufferSource(utf8(pin)), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bufferSource(b64uDecode(box.salt)), iterations: box.iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(b64uDecode(box.iv)) },
    key,
    bufferSource(b64uDecode(box.data)),
  );
  return fromUtf8(new Uint8Array(plain));
}
