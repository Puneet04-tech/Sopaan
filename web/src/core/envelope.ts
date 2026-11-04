// One signed envelope for every artifact (design §5.4). The signature covers the exact
// payload bytes, so no canonicalisation is needed for verification.
import {
  b64uDecode,
  b64uEncode,
  canonicalJson,
  fromUtf8,
  sectionHash,
  sha256Hex,
  signBytes,
  utf8,
  verifyBytes,
} from "./crypto";
import trustDoc from "../generated/trust.json";

export type EnvelopeType = "pack" | "cred" | "registry" | "event" | "token" | "allowance";

export interface Envelope {
  v: 1;
  kid: string;
  typ: EnvelopeType;
  payload: string;
  sig: string;
}

export interface Trust {
  root_kid: string;
  keys: Record<string, { role: string; public_key: string }>;
}

export const TRUST = trustDoc as Trust;
export const ROOT_KID = TRUST.root_kid;
export const ROOT_PUBLIC_KEY = TRUST.keys[ROOT_KID]?.public_key ?? "";

export interface ManifestEntry {
  file: string;
  sha256: string;
}

export interface SchemeDef {
  id: string;
  name: { en: string; hi: string; mr: string };
  cluster: "scholarship" | "training" | "education";
  level: string;
  source: { url: string; verified: string; note: string };
  criteria: RuleNode;
  documents: string[];
  deadline: string;
  place: { en: string; hi: string };
  helper: { name: string; phone: string };
  family_voice: { clip: string; en: string; hi: string };
  credits: { pool: string; milestone: string; amount_inr: number };
  golden: { profile: Record<string, unknown>; expect: string }[];
}

export interface RuleLeaf {
  id: string;
  logic: Record<string, unknown>;
  needs: string[];
}

export interface RuleNode {
  all?: (RuleLeaf | RuleNode)[];
  any?: (RuleLeaf | RuleNode)[];
}

export interface Career {
  id: string;
  title: { en: string; hi: string; mr: string };
  cluster: "vocational" | "technical" | "academic" | "enterprise" | "services";
  summary: { en: string; hi: string };
  interests: string[];
  skills: string[];
  cost_inr: number;
  distance_km: number;
  duration_months: number;
  wage_band: string;
  scheme_ids: string[];
  pathway_id: string;
  entry: { education_level: string[]; min_age: number; min_marks?: number };
}

export interface PathwayStep {
  id: string;
  kind: "qualification" | "training" | "documents" | "assessment" | "credential" | "milestone" | "deadline";
  title: { en: string; hi: string; mr?: string };
  requires: string[];
  documents: string[];
  deadline?: string;
}

export interface AudioClip {
  id: string;
  scheme_id: string;
  language: string;
  transcript: string;
  transcript_en: string;
  delivery: "device-tts" | "prerecorded";
}

export interface PackPayload {
  name: string;
  version: string;
  issued_at: string;
  expires_at: string;
  reviewers: string[];
  signer: { kid: string; role: string; pubkey: string; root_sig: string };
  manifest: ManifestEntry[];
  schemes: SchemeDef[];
  catalogue: { clusters: { id: string; en: string; hi: string; mr: string }[]; careers: Career[] };
  pathways: Record<string, PathwayStep[]>;
  audio: AudioClip[];
  golden: Record<string, { profile: Record<string, unknown>; expect: string }[]>;
  meta: {
    locale: string[];
    demo: boolean;
    review_status: string;
    note: string;
  };
}

export interface IssuerCert {
  kid: string;
  org: string;
  role: "FACILITATOR" | "ADMIN";
  scope: string[];
  epoch: number;
  valid_from: string;
  valid_to: string;
  pubkey: string;
  root_sig: string;
}

export interface BloomFilter {
  m: number;
  k: number;
  bits: string;
  capacity?: number;
}

export interface RegistryPayload {
  version: string;
  epoch: number;
  issued_at: string;
  valid_to: string;
  synced_at: string;
  issuers: IssuerCert[];
  revoked: { cred_id: string; revoked_at: string; reason: string; epoch: number }[];
  bloom: BloomFilter;
  note: string;
}

export interface CredentialPayload {
  id: string;
  iss: string;
  epoch: number;
  sub: string;
  skill: string;
  level: number;
  ev: string;
  iat: number;
  exp: number;
  evidence_label?: string;
}

export interface AllowancePayload {
  allow: string;
  pool: string;
  device: string;
  cap: number;
  ctr_start: number;
  exp: number;
  milestone: string;
  currency: "SIM";
}

export interface TokenPayload {
  tok: string;
  allow: string;
  cred: string;
  amt: number;
  ctr: number;
  iat: number;
}

// ------------------------------------------------------------------ signing

export function signEnvelope<T>(options: {
  privateKey: string;
  publicKey: string;
  typ: EnvelopeType;
  payload: T;
}): Envelope {
  const payloadText = canonicalJson(options.payload);
  const bytes = utf8(payloadText);
  return {
    v: 1,
    kid: kidFromPublicKey(options.publicKey),
    typ: options.typ,
    payload: b64uEncode(bytes),
    sig: signBytes(bytes, options.privateKey),
  };
}

function kidFromPublicKey(publicKey: string): string {
  const hash = sha256Hex(b64uDecode(publicKey));
  const bytes = new Uint8Array(hash.match(/.{2}/g)!.map((h) => parseInt(h, 16))).slice(0, 8);
  return b64uEncode(bytes);
}

export function decodePayload<T>(envelope: Envelope): T {
  return JSON.parse(fromUtf8(b64uDecode(envelope.payload))) as T;
}

/** Tampered bytes must never crash a verifier. */
export function safeDecodePayload<T>(envelope: Envelope): T | null {
  try {
    return decodePayload<T>(envelope);
  } catch {
    return null;
  }
}

export interface EnvelopeResult<T> {
  ok: boolean;
  errors: string[];
  payload: T | null;
}

export function verifyEnvelopeWithKey<T>(envelope: Envelope, publicKey: string): EnvelopeResult<T> {
  if (!envelope || typeof envelope !== "object") return { ok: false, errors: ["envelope_missing"], payload: null };
  const errors: string[] = [];
  if (envelope.v !== 1) errors.push("unsupported_version");
  if (!["pack", "cred", "registry", "event", "token", "allowance"].includes(envelope.typ)) errors.push("unknown_typ");
  const payloadBytes = b64uDecode(envelope.payload);
  const signatureOk = verifyBytes(payloadBytes, envelope.sig, publicKey);
  if (!signatureOk) errors.push("bad_signature");
  let payload: T | null = null;
  if (signatureOk) {
    try {
      payload = JSON.parse(fromUtf8(payloadBytes)) as T;
    } catch {
      errors.push("payload_not_json");
    }
  }
  return { ok: errors.length === 0, errors, payload };
}

export function verifyRootSignedRecord(record: unknown, signature: string): boolean {
  return verifyBytes(utf8(canonicalJson(record)), signature, ROOT_PUBLIC_KEY);
}

/** Verify a pack envelope AND every manifest section. */
export function verifyPack(envelope: Envelope): EnvelopeResult<PackPayload> {
  if (!envelope || envelope.typ !== "pack") return { ok: false, errors: ["not_a_pack"], payload: null };
  const decoded = safeDecodePayload<PackPayload>(envelope);
  if (!decoded) return { ok: false, errors: ["payload_not_json"], payload: null };
  if (!decoded.signer?.pubkey) return { ok: false, errors: ["signer_missing"], payload: null };

  const signerRecord = { kid: decoded.signer.kid, pubkey: decoded.signer.pubkey, role: decoded.signer.role };
  const errors: string[] = [];
  if (!verifyRootSignedRecord(signerRecord, decoded.signer.root_sig)) errors.push("signer_not_root_signed");

  const verified = verifyEnvelopeWithKey<PackPayload>(envelope, decoded.signer.pubkey);
  errors.push(...verified.errors);
  if (!verified.payload) return { ok: false, errors, payload: null };

  for (const entry of verified.payload.manifest) {
    const section = (verified.payload as unknown as Record<string, unknown>)[entry.file];
    if (section === undefined) errors.push(`section_missing:${entry.file}`);
    else if (sectionHash(section) !== entry.sha256) errors.push(`section_hash_mismatch:${entry.file}`);
  }
  if (!verified.payload.expires_at) errors.push("expiry_missing");
  if (verified.payload.reviewers.length < 2) errors.push("reviewers_below_quorum");
  return { ok: errors.length === 0, errors, payload: verified.payload };
}

export function packSignatureHex(envelope: Envelope): string {
  return sha256Hex(b64uDecode(envelope.payload));
}
