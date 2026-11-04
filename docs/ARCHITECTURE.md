# Architecture as built

Sopaan is one trust chain expressed in three runtimes. The student's phone must be able to answer,
prove and get paid without a network; the server must be able to verify everything later; the AI must
never be able to publish a rule or issue a credential.

```
                       signed artifacts (Ed25519)
            ┌────────────────────────────────────────────┐
            │ packs/  schemes · catalogue · registry      │
            └───────────────┬────────────────────────────┘
                            │ replicated by file, QR, cloud
┌───────────────────────────▼───────────────────────────┐      ┌──────────────────────┐
│ TIER 1  web/  Preact PWA                              │      │ TIER 3  ai/ FastAPI   │
│ Dexie WAL + segmented outbox + cached packs           │      │ propose rules/profile │
│ rules3v · envelope · verify · credits · hub           │◄────►│ explain · validate    │
│ works with zero network after install                 │      │ optional, stateless   │
└───────────────────────────┬───────────────────────────┘      └──────────┬───────────┘
                            │ signed events, packs, registry              │
                            ▼                                             │
┌──────────────────────────────────────────────────────────────────────────▼───────────┐
│ TIER 2  server/  Spring Boot 3 modular monolith                                      │
│ security · packs · reviews · registry · passport · sync · cohort · credits · audit     │
│ profile `hub` = loopback + H2 file        profile `cloud` = Postgres + public listener │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. Trust chain

Every artifact is one envelope:

```json
{ "v": 1, "kid": "…", "typ": "pack|registry|credential|allowance|token", "payload": "base64url", "sig": "base64url" }
```

- The signature is over the **exact payload bytes**, so a verifier never has to re-serialise.
- Canonical JSON (sorted keys, no whitespace) is used only when *creating* a payload.
- A signer record is `{kid, pubkey, role}` and is itself signed by the offline root key.
  `packs/trust.json` pins the root; the server mirrors that trust file through `KeyStore`.
- Pack payloads carry a manifest of section hashes, reviewer signatures, expiry and golden cases.
  Editing one scheme without re-signing fails verification.
- Registry snapshots carry the issuer list, epoch and Bloom revocation filter. A credential whose
  `kid` is absent, whose epoch is stale, or whose id is in the filter is rejected.

The browser verifier (`web/src/core/verify.ts`), the command-line verifier (`tools/verify.mjs`) and
the server (`SignatureTest`, `PackService`) all use the same bytes and the same golden vectors.

## 2. Client state and offline behaviour

Dexie tables: `profile`, `pathways`, `packs`, `registry`, `credentials`, `credits`, `outbox`,
`settings`, `audit`. Writes happen in a transaction that also appends a signed event; there is no
path that changes local state without an event.

The outbox is append-only and segmented. Each event is `{event_id, device_id, seq, type, ts, payload,
sig}` signed by the device key. Push is idempotent by `(device_id, seq)`. `acked_upto` only moves
past events the server accepted **or permanently rejected** — a rejected event is recorded in
`rejected_event`, otherwise a bad sequence would stall the watermark forever.

The device key is generated on first run and stored in the local store. There is no account password
in the demo; the server issues a short-lived JWT at enrolment.

## 3. Server modules

| Package | Responsibility | Key rules |
|---|---|---|
| `security` | HS256 JWT, role filter, CORS | public: meta, health, enrolment, packs, registry, credential GET |
| `rules` | pack load/verify, review, publish | 2 distinct reviewer kids; golden gate; idempotent approval |
| `passport` | credentials, registry snapshot | leased issuer key, epoch fencing, revocation |
| `sync` | enrol, signed push, pull | `(device_id, seq)` idempotency; signature check before projection; conflict flag |
| `cohort` | facilitator cohorts | owner-only dashboards; demo-mode allows the seeded cohort |
| `credits` | pools, allowances, settlement | signature + cap + expiry; idempotent by token id; counter reuse flagged |
| `audit` | hash-chained audit log | each row hashes the previous hash; admin-only read |
| `config` | meta, key store, error handler | demo-mode disclosure in `/v1/meta` |

Everything uses `JdbcTemplate` and explicit SQL. No JPA, no Spring Security, no hidden magic: the
schema is `V1__init.sql`, seeds are `V2__seed.sql`, rejected-event storage is `V3__rejected.sql`.

## 4. Credit lifecycle

1. A sponsor registers a **pool** (simulated rupees) and signs an **allowance lease**: capped,
   expiring, starting at a counter.
2. A device mints **counted tokens** only against a credential that verifies locally; each token
   carries `allow`, `ctr`, `amt`, `cred` and the issuer signature.
3. Settlement posts the allowance envelope (stored idempotently) plus tokens. The server verifies
   the token signature, the credential, the cap and the counter.
4. Replaying an already-settled token changes nothing. Reusing a counter is reported as
   `counter_reuse` and audited, but the original settlement is **not** reversed — the ledger stays
   append-only and a human investigates.

Amounts are labelled simulated everywhere. No payment rail exists.

## 5. AI sidecar boundary

`ai/` is stateless and optional. It has four jobs: draft a rule tree from scheme text, extract
profile fields from one sentence, turn an existing outcome into plain language, and validate a signed
pack. The deterministic path is the default; an OpenAI-compatible model can be enabled with
`SOPAAN_AI_PROVIDER=openai` and `OPENAI_API_KEY`, and is used **only** for rule drafting. Profile
text never leaves the device to a model.

Rules produced by the sidecar are always `review_required=true`; two human reviewers and the golden
suite still gate publication. Unparsed text fails closed (a `c_manual` rule that is always false)
rather than silently granting eligibility to everyone.

## 6. Profiles and deployment

- `hub` (`application-hub.yml`): binds `127.0.0.1`, H2 file under `server/data`, demo mode on. This is
  the facilitator laptop.
- default (`application.yml`): H2 file for a zero-setup demo, demo mode on.
- `cloud` (`application-cloud.yml`): Postgres from `DATABASE_URL`, public listener, demo mode off by
  default, `SOPAAN_JWT_SECRET` required in practice.

The three processes run directly from source (`npm run dev:web`, `npm run dev:server`,
`npm run dev:ai`). No container packaging is included; a managed host should build the PWA assets
and run the Spring jar and FastAPI app as separate services.

## 7. Failure behaviour

| Failure | Result |
|---|---|
| Pack tampered | client refuses activation; server refuses publish; verifier says `bad_signature` |
| Registry stale / issuer revoked | credential shows `REVOKED` or `ISSUER_UNKNOWN`, never "valid" |
| Sync rejected event | recorded permanently, watermark advances, client drops the segment |
| Credit service offline | tokens stay queued locally; nothing is lost |
| AI service offline | deterministic sample / local explanation; no feature disappears |
| Clock skew | expiry checks use both `exp` and server time; stale leases are refused |

## 8. Targets vs measurements

The design document's NFR table is a **target**. This repository reports only what it measured:
the PWA build output, test counts and the e2e check list. It does not claim rural bandwidth,
retention or placement outcomes that were never measured.
