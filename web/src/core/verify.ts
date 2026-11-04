// Offline verification (design §5.5.2): issuer known -> signature -> epoch/lease ->
// expiry -> revocation Bloom. Registry age is always returned for display.
import {
  ROOT_PUBLIC_KEY,
  safeDecodePayload,
  verifyEnvelopeWithKey,
  verifyRootSignedRecord,
  type AllowancePayload,
  type CredentialPayload,
  type Envelope,
  type IssuerCert,
  type RegistryPayload,
  type TokenPayload,
} from "./envelope";
import { mightContain } from "./bloom";

export type VerifyStatus = "VALID" | "INVALID" | "POSSIBLY_REVOKED";

export interface VerifyResult {
  status: VerifyStatus;
  reasons: string[];
  issuer: IssuerCert | null;
  payload: CredentialPayload | null;
  registryAgeDays: number | null;
  revokedChecked: boolean;
}

export function registryAgeDays(registry: RegistryPayload | null, now = Date.now()): number | null {
  if (!registry) return null;
  const synced = Date.parse(registry.synced_at);
  if (Number.isNaN(synced)) return null;
  return Math.max(0, Math.floor((now - synced) / 86_400_000));
}

export function verifyCredential(
  envelope: Envelope,
  registry: RegistryPayload | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifyResult {
  const reasons: string[] = [];
  const fail = (reason: string): VerifyResult => ({
    status: "INVALID",
    reasons: [...reasons, reason],
    issuer: null,
    payload: null,
    registryAgeDays: registryAgeDays(registry),
    revokedChecked: false,
  });

  if (!envelope || envelope.typ !== "cred") return fail("not_a_credential");
  if (!registry) return fail("no_registry_cached");

  const payload = safeDecodePayload<CredentialPayload>(envelope);
  if (!payload) return fail("payload_not_json");
  const cert = registry.issuers.find((issuer) => issuer.kid === payload.iss) ?? null;
  if (!cert) return fail("unknown_issuer");
  if (envelope.kid !== payload.iss) return fail("issuer_mismatch");

  const { root_sig, ...certRecord } = cert;
  if (!verifyRootSignedRecord(certRecord, root_sig)) return fail("issuer_cert_not_root_signed");

  const verified = verifyEnvelopeWithKey<CredentialPayload>(envelope, cert.pubkey);
  if (!verified.ok) return fail("bad_signature");

  if (payload.epoch < cert.epoch) return fail("fenced_by_epoch");
  const issuedAt = payload.iat;
  const leaseFrom = Date.parse(`${cert.valid_from}T00:00:00Z`) / 1000;
  const leaseTo = Date.parse(`${cert.valid_to}T23:59:59Z`) / 1000;
  if (issuedAt < leaseFrom || issuedAt > leaseTo) return fail("outside_issuer_lease");
  if (nowSeconds > payload.exp) return fail("expired");
  if (!cert.scope.some((scope) => payload.skill === scope || payload.skill.startsWith(`${scope}.`))) {
    return fail("outside_issuer_scope");
  }

  const revoked = registry.revoked.find((entry) => entry.cred_id === payload.id);
  if (revoked) {
    return {
      status: "INVALID",
      reasons: ["revoked", revoked.reason],
      issuer: cert,
      payload,
      registryAgeDays: registryAgeDays(registry),
      revokedChecked: true,
    };
  }

  if (mightContain(registry.bloom, payload.id)) {
    // No exact entry cached: a Bloom positive is never proof, it means "check online".
    const exact = registry.revoked.some((entry) => entry.cred_id === payload.id);
    if (!exact) {
      return {
        status: "POSSIBLY_REVOKED",
        reasons: ["bloom_positive_check_online"],
        issuer: cert,
        payload,
        registryAgeDays: registryAgeDays(registry),
        revokedChecked: true,
      };
    }
  }

  return {
    status: "VALID",
    reasons: [],
    issuer: cert,
    payload,
    registryAgeDays: registryAgeDays(registry),
    revokedChecked: true,
  };
}

export function verifyRegistry(envelope: Envelope): {
  ok: boolean;
  errors: string[];
  registry: RegistryPayload | null;
} {
  const verified = verifyEnvelopeWithKey<RegistryPayload>(envelope, ROOT_PUBLIC_KEY);
  if (!verified.ok || !verified.payload) return { ok: false, errors: verified.errors, registry: null };
  const errors: string[] = [];
  for (const cert of verified.payload.issuers) {
    const { root_sig, ...record } = cert;
    if (!verifyRootSignedRecord(record, root_sig)) errors.push(`issuer_cert_bad:${cert.kid}`);
  }
  return { ok: errors.length === 0, errors, registry: verified.payload };
}

export function verifyAllowance(envelope: Envelope, publicKey: string) {
  return verifyEnvelopeWithKey<AllowancePayload>(envelope, publicKey);
}

export function verifyToken(envelope: Envelope, registry: RegistryPayload | null) {
  const cert = registry?.issuers.find((issuer) => issuer.kid === envelope.kid);
  const verified = verifyEnvelopeWithKey<TokenPayload>(envelope, cert?.pubkey ?? "");
  return { ...verified, cert };
}

export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
