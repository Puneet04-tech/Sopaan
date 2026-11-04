# Security and privacy notes

This is a hackathon prototype with production-shaped controls. It is **not** audited, and the demo
keys are public by design. Read the "known gaps" before showing it to anyone who might treat it as a
live eligibility or payment system.

## Assets

1. Eligibility answers that cite a rule and a source (wrong answers mislead a learner).
2. Skill credentials (forgery inflates a learner's proof).
3. Sponsor credit (simulated here, but the settlement logic is the sensitive part).
4. Learner profile data (category, gender, income, disability — sensitive personal data).
5. The audit trail (who published a rule, who issued or revoked a credential).

## Adversaries

| Adversary | Goal | Control |
|---|---|---|
| Learner with a hex editor | edit a scheme or credential | Ed25519 over exact payload bytes; manifest section hashes; client refuses activation |
| Device thief | issue credentials for themselves | issuer keys are leased to facilitator/hub roles; scope check per skill; audit entry |
| Replay attacker | reuse a sync batch or a credit token | `(device_id, seq)` uniqueness; token id idempotency; counter-reuse flag |
| Malicious reviewer | publish a rule alone | two distinct reviewer kids plus a green golden suite |
| Stale-key holder | keep issuing after rotation | registry epoch fencing and Bloom revocation; stale epoch rejected |
| Network attacker | tamper with sync | per-event device signature verified before projection |
| Curious sponsor | read learner rows | sponsor endpoints return aggregates; cohort dashboard is owner-scoped |
| Prompt-injection via scheme text | make the AI publish a permissive rule | AI output is `PROPOSED`, fail-closed when unparsed, never published without humans |

## Controls in the code

- **Keys.** Ed25519 for artifacts, HS256 for one-hour session JWTs. Root key signs signer records;
  `packs/trust.json` pins the root. `KeyStore` loads the same dev keys on the server.
- **Envelope.** `{v,kid,typ,payload,sig}`; payload is base64url JSON; verification uses the exact
  bytes. A second serialisation cannot change the meaning of a signed artifact.
- **Review.** `ReviewService` refuses duplicate reviewer kids and requires the golden suite to pass.
  Approval is idempotent per reviewer.
- **Registry.** Snapshots are signed, carry an epoch and a Bloom filter of revoked credential ids.
  Issuers have a skill scope; issuance outside it returns `skill_outside_issuer_scope`.
- **Sync.** Event signature covers id, device, seq, type, timestamp and payload. Permanent rejects
  are recorded so the high-water mark advances. Profile conflicts are flagged, not silently merged.
- **Credits.** Allowance verification is signature-first, then expiry; cap is enforced server-side;
  settlement is idempotent by token id; counter reuse is flagged and audited without rewriting the
  ledger.
- **Audit.** Append-only rows, each hashing the previous hash (`AuditService`). Admin-only read.
- **Transport.** The hub profile binds loopback. Put TLS in front for any LAN or public deployment;
  the JWT and signatures do not encrypt traffic.
- **AI.** Stateless, loopback-bound, no profile text sent to a model. `SOPAAN_AI_PROVIDER` defaults
  to deterministic. No API key is ever shipped to the browser.
- **Demo mode.** Role escalation and the cohort-ownership bypass exist only when
  `sopaan.demo-mode=true`, and every use writes `demo.role` / demo audit entries. The `cloud` profile
  defaults it to `false`; keep `SOPAAN_DEMO_MODE=false` in any shared environment.

## Known gaps (deliberate, documented)

1. **Dev keys are public.** `tools/dev-keys.json` is in the repo so the demo runs offline. A real
   deployment must generate new keys, keep the root offline, and replace `packs/trust.json`.
2. **Rules are not verified against official portals.** Source URLs and "last verified" dates come
   from the design's fieldwork window. Treat every rule as unverified.
3. **No real payments.** Credits are simulated entitlements. No UPI, lender, escrow or award decision.
4. **No production identity.** Enrolment trusts a device-generated key; there is no Aadhaar/DigiLocker
   binding, no phone verification, no account recovery.
5. **Local data is not encrypted at rest.** IndexedDB is protected by the browser profile only. A
   shared phone needs OS-level profiles or an app lock.
6. **JWT secret defaults to a dev value.** Set `SOPAAN_JWT_SECRET` in any non-demo environment.
7. **No rate limiting.** A public deployment needs a gateway limit on enrolment, push and settlement.
8. **Voice audio is not recorded or uploaded.** The optional recogniser runs locally; this also means
   there is no server-side accuracy measurement.
9. **Hub sync over LAN is not shipped.** It needs locally trusted HTTPS; QR, file and cloud carry
   signed artifacts today.
10. **Bloom filter is a screening aid.** False positives are possible; the authoritative revocation
    list remains the registry snapshot.
