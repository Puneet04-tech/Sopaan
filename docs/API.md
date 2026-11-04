# API

## Conventions

- Spring Boot base: `http://localhost:8080` (hub and cloud run the same jar).
- AI sidecar base: `http://127.0.0.1:8000` (loopback only).
- JSON in, JSON out. Errors are `{"error": "code", "message": "…"}` with a 4xx/5xx status.
- Authenticated calls use `Authorization: Bearer <jwt>`. The JWT is issued by enrolment, lives one
  hour, and carries `sub` (device id) and `role`.
- Roles: `DEVICE`, `FACILITATOR`, `REVIEWER`, `SPONSOR`, `HUB`, `ADMIN`.
- In demo mode only (`sopaan.demo-mode=true`), enrolment honours a requested role and audits
  `demo.role`. Production ignores it and issues `DEVICE`.

## Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/meta` | profile, demo flag, pack/registry pointers, issuer count, credential stats |
| GET | `/actuator/health` | liveness |
| POST | `/v1/devices:enroll` | register a device public key, receive a JWT |
| GET | `/v1/packs`, `/v1/packs/{file}` | signed pack artifacts |
| GET | `/v1/registry/snapshot` | signed issuer/revocation snapshot |
| GET | `/v1/credentials/{credId}` | signed credential envelope (QR verifiers may fetch) |

### Enrol

```http
POST /v1/devices:enroll
{"device_id":"dev-radha-01","student_id":"stu-radha","pubkey":"<base64url ed25519>","role":"FACILITATOR"}
```

```json
{"token":"<jwt>","role":"FACILITATOR","expires_at":"2026-11-04T09:00:00Z"}
```

A different key for an existing `device_id` returns `409 device_key_mismatch`.

## Sync

### Push

```http
POST /v1/sync/push
Authorization: Bearer <jwt>
{"events":[
  {"event_id":"evt_…","device_id":"dev-radha-01","seq":41,"type":"ProfileFieldConfirmed",
   "ts":1762240000000,"payload":{"field":"family_income","value":180000},"sig":"<base64url>"}
]}
```

```json
{"accepted":1,"rejected":[],"acked_upto":41}
```

- Idempotent by `(device_id, seq)`; replaying an accepted event is a no-op.
- A permanently rejected event is written to `rejected_event` and still advances `acked_upto`.
- The signature covers `event_id, device_id, seq, type, payload, ts` exactly as canonical JSON.
- Projections: `ProfileFieldConfirmed` (conflict if another device wrote the same field in the last
  10 minutes), `PathwayStepRecorded`. Other types are stored but not projected.

### Pull

```http
GET /v1/sync/pull
Authorization: Bearer <jwt>
```

Returns `cursor`, `server_time`, available `packs`, current `registry` pointer and `conflicts`.

## Credentials and registry

```http
POST /v1/credentials            # roles: FACILITATOR, HUB, ADMIN
{"subject_id":"stu-radha","skill":"tailoring","level":2,"evidence_label":"Assessor observed 3 garments","issuer_kid":"issuer-hub-1"}
```

Returns `{cred_id, envelope, status: "ISSUED"}`. The envelope is Ed25519-signed by the leased issuer
key and includes the registry epoch.

```http
POST /v1/credentials/{credId}:revoke     # FACILITATOR, ADMIN
{"reason":"evidence withdrawn"}
```

`GET /v1/registry/snapshot` returns a signed snapshot; `GET /v1/registry/issuers` lists active
issuers and the epoch (requires auth).

## Credits (simulated)

```http
POST /v1/credits/pools          # SPONSOR, ADMIN
{"pool_id":"pool-pune-01","sponsor":"Lok Foundation","total_inr":50000,"milestone":"tailoring L2"}
```

```http
POST /v1/credits/allowances     # SPONSOR, DEVICE, HUB, ADMIN
{ "v":1, "kid":"…", "typ":"allowance", "payload":"…", "sig":"…" }
```

```http
POST /v1/credits/settle         # DEVICE, FACILITATOR, SPONSOR, HUB, ADMIN
{"allowance":{…}, "tokens":[{"token_id":"tok_…","allow_id":"allow_…","ctr":4,"amount":500,"cred_id":"cred_…","envelope":{…}}]}
```

```json
{"settled":["tok_…"],"flagged":[],"reasons":[],"remaining_inr":49500}
```

Outcomes: `cap_exceeded`, `counter_reuse` (flagged, original settlement kept), `bad_token_signature`,
`unknown_issuer`, `field_mismatch`, `allowance_expired`.

`GET /v1/credits/pools` (SPONSOR, FACILITATOR, ADMIN) returns aggregate pools, never learner rows.

## Cohorts

```http
POST /v1/cohorts                          # FACILITATOR, ADMIN
{"name":"Pune ITI · Batch 3","district":"Pune"}

POST /v1/cohorts/{cohortId}/members       # FACILITATOR, ADMIN
{"student_id":"stu-radha"}

GET  /v1/cohorts/{cohortId}/dashboard     # FACILITATOR (owner), ADMIN
```

The dashboard is aggregate-only: counts of profiles, pathways, credentials and pending sync.

## Review and audit

```http
GET  /v1/admin/rules                       # REVIEWER, ADMIN
GET  /v1/admin/rules/{packId}/golden       # REVIEWER, ADMIN, FACILITATOR
POST /v1/admin/rules/{packId}:approve      # REVIEWER, ADMIN
{"reviewer_kid":"reviewer-2"}
```

Approval needs two **distinct** reviewer kids and a green golden run. The response reports
`status: "PUBLISHABLE"` only when both hold.

`GET /v1/audit?limit=50` (ADMIN) returns the hash-chained audit entries and total count.

## AI sidecar

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | — | provider is `deterministic` unless a model key is configured |
| POST | `/v1/profile:extract` | `{"text":"…","locale":"hi"}` | deterministic only; returns fields, confidence, missing, notes |
| POST | `/v1/rules:extract` | `{"text":"…","locale":"en"}` | draft criteria + unparsed list; always `review_required` |
| POST | `/v1/explain` | `{"scheme_name","outcome","failing_rule","missing","locale"}` | template text, no model call |
| POST | `/v1/packs:validate` | `{"envelope":{…}}` | signature, manifest hashes, reviewer quorum |
| POST | `/v1/fairness:report` | `{"envelope":{…}}` | synthetic panel; flags impact ratio < 0.8 |

`POST /v1/rules:extract` is the only endpoint that may call a model when
`SOPAAN_AI_PROVIDER=openai`. Any error falls back to the deterministic extractor.

## Error codes seen in practice

| Status | Code | Meaning |
|---|---|---|
| 400 | `schema_invalid`, `tokens_required`, `bad_allowance_signature` | request shape or signature field missing/wrong |
| 401 | `authentication_required` | no/invalid bearer token |
| 403 | `forbidden_role`, `device_not_enrolled`, `not_cohort_owner`, `skill_outside_issuer_scope` | authenticated but not allowed |
| 404 | `credential_not_found`, `pack_not_found`, `cohort_not_found` | unknown object |
| 409 | `device_key_mismatch`, `pool_exists` | conflicting state |
| 413 | `batch_too_large` | more than 200 sync events |
