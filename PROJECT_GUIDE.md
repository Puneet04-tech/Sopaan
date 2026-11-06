# SOPAAN — Project Guide

**What this file is:** the working map of the project as it exists in this repository — how the
pieces fit, what to do with each screen, and an honest audit of where the build stands against
`Sopaan Full system architecture` (Tier 1 student PWA → Tier 2 facilitator hub → Tier 3 cloud).

Companion docs: `README.md` (positioning), `docs/ARCHITECTURE.md`, `docs/API.md`,
`docs/SECURITY.md`, `docs/DEMO.md`, `docs/IMPLEMENTATION_PLAN.md`.

---

## 1. The one-paragraph version

Sopaan is an offline-first "learning to livelihood" platform. A learner signs in, states her
situation, sees which schemes she is actually eligible for (with the rule, pack version, source
and date cited), picks a career path, gets a skill signed by an assessor, and lets a sponsor's
capped credit unlock **only** against that signed proof. The phone is the system of record: it
keeps working with the network off and syncs signed events later. Two accounts on the same
phone never see each other's data, and live updates are delivered per account.

---

## 2. How to run it

Two processes. Both must be running for login, sync and live updates.

```bash
# Terminal 1 — backend (Spring Boot 3, H2 file DB, Flyway migrations)
cd server
./mvnw.cmd spring-boot:run          # Windows
./mvnw spring-boot:run              # macOS / Linux
# → http://localhost:8080   (health: /actuator/health)
```

```bash
# Terminal 2 — frontend (Vite + Preact + TypeScript PWA)
cd web
npm install
npm run dev
# → http://127.0.0.1:5173
```

Optional, not required for any decision, credential, credit or sync:

```bash
cd ai && uvicorn service:app --port 8000    # rules:extract, profile:extract, explain
```

Backend storage lives in `server/data/sopaan*` (H2 files). Deleting those files resets accounts,
events and credentials — that is the only reset that also clears server-side accounts.

Checks that exist and pass:

```bash
cd web    && npm run build                               # tsc --noEmit + production PWA build
cd web    && npm test                                    # 30 unit + property tests
cd web    && npm run build && npx playwright test         # airplane-mode end-to-end
cd server && ./mvnw.cmd test                              # 16 tests incl. jqwik + ArchUnit
k6 run -e TOKEN=<jwt> tools/load/sync-burst.js            # sync burst load test
./tools/security/zap-baseline.sh http://localhost:8080    # ZAP passive baseline
```

---

## 3. End-to-end workflow (what the product actually does)

```
Register / Login
      │  account created in app_user (BCrypt hash), student row linked
      ▼
Profile  ──►  signed ProfileFieldConfirmed events (one IndexedDB transaction each)
      │        every field carries value + confidence + source + per-device version
      ▼
Discover ──►  careers ranked from the confirmed profile
      │        score = 0.30 interest + 0.25 skill + 0.15 cost + 0.15 distance
      │                + 0.10 prerequisites − 0.05 gap, then diversity re-ranking
      ▼
Plan     ──►  pathway steps for the chosen career; each step is a signed event
      ▼
Act      ──►  eligibility per scheme, evaluated on-device from a signed rule pack
      │        answer is ELIGIBLE / NOT_ELIGIBLE(rule) / NEED_INFO(fields) — never a guess
      ▼
Prove    ──►  Skill Passport: Ed25519-signed credentials, QR-verifiable with no network
      ▼
Credits  ──►  mint a counted token against a VALID credential, under a capped, expiring lease
      ▼
Sync     ──►  events up (idempotent, high-water-mark ack), packs + registry down
      ▼
Live     ──►  every accepted event is pushed to that account's open clients in real time
```

The five links are the product thesis: **rule → answer → next step → proof → credit**. Each link
produces an artifact the next link can check without a dashboard being online.

---

## 4. Architecture audit — diagram vs. build

| Diagram block | Tier | Status in this repo | Where |
|---|---|---|---|
| UI shell, Hindi/Marathi i18n, dark theme | 1 | **Built** | `web/src/features`, `web/src/i18n` |
| Profile service (confidence + source per field) | 1 | **Built** | `web/src/data/profile.ts` |
| Career + pathway engine (weighted score, no LLM) | 1 | **Built** | `web/src/core/scoring.ts`, `pathway.ts` |
| Rules engine (3-valued, pack version, citations) | 1 | **Built** | `web/src/core/rules3v.ts` (parity test in `server/src/test`) |
| Passport wallet + verifier | 1 | **Built** | `web/src/data/wallet.ts`, `web/src/features/Verify.tsx` |
| Credit wallet (lease + counter) | 1 | **Built** (simulated value) | `web/src/data/credits.ts` |
| IndexedDB local store | 1 | **Built** — one database **per account** | `web/src/data/db.ts` |
| Outbox / WAL / segments | 1 | **Built** | `web/src/data/outbox.ts` |
| Pack manager (verify, version, rollback) | 1 | **Built** | `web/src/data/packs.ts` |
| Sync engine + transports | 1 | **Built** (HTTPS only) | `web/src/data/sync.ts` |
| Service worker / PWA install | 1 | **Built** (Workbox via `vite-plugin-pwa`) | `vite.config.ts` |
| Voice I/O (closed grammar + TTS) | 1 | **Partial** — icon picker always works, Hindi ASR model not bundled | `web/src/voice/` |
| QR scanner / file import | 1 | **Built** | `Verify.tsx`, `Sync.tsx` |
| Real-time fan-out to learners | 1↔3 | **Built** — authenticated SSE, scoped per student | `server/.../realtime` |
| Facilitator hub (roster, assessment, issuing) | 2 | **Partial** — issues under the published dev key | `web/src/features/Hub.tsx` |
| Spring Boot hub profile | 2 | **Built** (`application-hub.yml`) | `server/src/main/resources` |
| H2 pack cache, leased issuer key, epochs | 2 | **Built** | `server/.../config/KeyStore.java`, `passport` |
| FastAPI sidecar | 2/3 | **Built but optional and off by default** | `ai/` |
| Spring Boot 3 cloud modular monolith | 3 | **Built** | `server/src/main/java/com/sopaan` |
| JWT filter, role guard, device-signature challenge | 3 | **Built** | `security/` |
| Rules / passport / sync / cohort / credits / audit modules | 3 | **Built** | one package each |
| FastAPI + Pydantic LLM helpers | 3 | **Partial** — endpoints exist, no key ⇒ deterministic fallback | `ai/service.py` |
| Postgres / Neon, CI, static host, observability | 3 | **Not in this build** — H2 file DB, no deployment pipeline here | — |
| LAN hub sync | 2 | **Not built** (labelled stretch: needs trusted local HTTPS) | — |

Legend: **Built** = works end to end and is exercised by the app. **Partial** = the mechanism
exists but a piece is deliberately absent or dev-only. **Not built** = planned, not present.

---

## 5. Accounts: login and isolation

### 5.1 Login

* `app_user` holds `username` (lower-cased), `password_hash` (BCrypt), `role`, `enabled`,
  `student_id`, `last_login_at`. Migration: `server/src/main/resources/db/migration/V4__auth_users.sql`.
* `POST /v1/auth/register` → creates a `student` row **and** the account in one transaction, then
  returns a JWT.
* `POST /v1/auth/login` → BCrypt match, returns a fresh JWT. Wrong password ⇒ `401
  invalid_credentials`; unknown user ⇒ the same `401` (no account enumeration).
* Token is stored in `localStorage` under `sopaan_auth_token`. `GET /v1/auth/me` returns the
  caller's own record only.
* After a successful sign-in the app routes to `#/discover`, never back to the landing page.
* Sign-out lives in **Settings → Account**; it clears the token and returns to the landing page.

**Rules of thumb**

* Username must be new; password ≥ 6 characters.
* Existing usernames cannot be re-registered (`409 username_or_email_exists`).
* An account whose stored hash no longer matches the current encoder can only be fixed by
  registering a fresh username (or by re-hashing that row on the server).

### 5.2 Isolation — three layers

| Layer | Mechanism | Effect |
|---|---|---|
| Browser storage | **One IndexedDB per account**: `sopaan` (no account) or `sopaan_acct_<userId>` | profile, outbox, wallet, roster, progress of account A are invisible to account B on the same phone |
| Server reads/writes | `StudentScope.forActor(subject, role)` resolves the student **from the JWT only** | a body-supplied `student_id` is ignored; you cannot read or write another student's rows |
| Device binding | `POST /v1/devices:enroll` links the device key to the account (`device.user_id` + `device.student_id`) | signed events are only accepted from devices bound to the caller's own student |

Isolation was verified against the running server:

```
# Account B pushing a device that belongs to account A
{"rejected":[{"event_id":"evt-iso-1","code":"device_not_yours"}],"acked_upto":0}

# Account A pushing its own device (reaches signature verification, as it should)
{"rejected":[{"event_id":"evt-iso-1","code":"bad_signature"}],"acked_upto":0}

# Enrolling with a spoofed body student_id
{"student_id":"01a1ac96-…","role":"DEVICE"}   # body value ignored, account's own id used
```

Consequence worth knowing: signing in creates a **new empty store** for that account. Confirm
your profile once per account; it is then remembered for that account on that phone.

### 5.3 Roles

`STUDENT` is assigned on registration. `FACILITATOR`, `REVIEWER`, `SPONSOR`, `ADMIN`, `HUB` and
`DEVICE` exist in the token model and are enforced server-side, but **there is no UI to grant
them yet** (see §9). A device enrolled before sign-in gets `DEVICE`; with `sopaan.demo-mode=true`
an enrolment may request another role (audited as `demo.role`).

---

## 6. Real time

* Transport: **Server-Sent Events** at `GET /v1/realtime/stream`, authenticated with the bearer
  token. The server resolves the student from the token and files the connection under that
  student id — the client never names a topic.
* Publisher: `SyncService` calls `RealtimeService.broadcastToStudent(...)` after every accepted
  event, which pushes to the SSE hub and (for hub↔cloud tooling) the STOMP topic.
* Client: `web/src/data/realtime.ts` streams frames with `fetch`, reconnects with exponential
  backoff, and on each frame refreshes local state and raises a toast.
* Status: `GET /v1/realtime/status` → `{ "student_id": …, "subscribers": n }`; Settings shows
  `live` / `reconnecting` / `off`.

Verified against the running server: a signed event queued and pushed from the app appeared as an
`event:ProfileFieldConfirmed` frame on that account's open stream in the same second, and the
`ready` frame plus `subscribers` count were keyed to the account's own `student_id`.

The STOMP endpoint `/ws` still exists for internal fan-out. Learner clients use SSE because it
carries the `Authorization` header and cannot subscribe to a destination of their choosing.

---

## 7. The UI, element by element

Global chrome: bottom navigation is **Home · Discover · Plan · Prove · More**; the top bar holds
the brand mark, a network pill (`ऑनलाइन / ऑफ़लाइन` plus the queued-event count), the theme
toggle (dark is the product default), and the language cycler **हिं → EN → मरा**.

### 7.1 Landing (`#/welcome`, and `#/` while signed out)

| Element | Meaning |
|---|---|
| `Login` / `Sign up` buttons (header + footer + cards) | Routes to `#/login`, `#/register` |
| `Open app` | Enters the app without an account (anonymous local store) |
| Hero eyebrow "Maharashtra · offline-first · demo build" | Scope of this build, stated up front |
| Hero headline + Hindi line | The positioning: potential → proof |
| Two auth cards | Already have an account → Login; New → Sign up |
| Proof packet card (5 rows) | A sample of the chain: Rule · Answer · Next step · Credential · Credit, with `SIGNED` stamp |
| "The gap" — cards A/B/C | Why the chain breaks: scattered guidance, paper proof, money waiting on trust |
| "The chain" — 5 numbered links | The five artifacts and what each one checks |
| "Field conditions" band | Offline after first load · three languages · no Aadhaar · honest states |
| "Roles" — 4 cards | Student, Facilitator, Reviewer, Sponsor/verifier |
| Final CTA | "Walk the demo" (Radha's eight steps) or go to the dashboard |
| Footer | Login, Sign up, Enter app, Settings |

### 7.2 Login (`#/login`) and Register (`#/register`)

* **Login:** Username, Password, `Login` button, "Don't have an account? Register".
* **Register:** Username, Display Name, Email (optional), Password, `Register` button,
  "Already have an account? Login".
* Errors are specific: `Cannot reach the server…` (wrong/missing server address),
  `Username already exists.` (409), otherwise a generic failure line.

### 7.3 Home (`#/`)

| Element | Meaning |
|---|---|
| Avatar + greeting | First letter of `student_name`, class and district |
| Mic icon button | Opens Profile (voice/icon intake) |
| Dark "five-link chain" card + stairway | How many of the five links are proven for you (0–5) |
| Metrics: Eligible / Need info / Credentials | Live counts from the pack + wallet |
| Suggested career card | Top-ranked path with fit %, wage band, distance |
| "Verified eligibility" card | Count of eligible schemes + freshness chip |
| "Sync status" card | Online/offline, pending events, shortcut to Sync |
| "Radha's story — 8 steps" | The demo tour |
| Footer badges | Pack version, pack fresh/stale, registry date, "credits simulated" |

### 7.4 Profile (`#/profile`)

| Element | Meaning |
|---|---|
| Completion % | Share of the seven intake questions confirmed |
| Question counter `n / 7` | Where you are in the script |
| "माइक उपलब्ध / माइक नहीं" | Whether speech input is available on this device |
| Icon answer buttons | Always-available fallback for voice |
| "या लिखें" text box | Type an answer instead |
| "नमूना जवाब" (sample answer) | Fills a worked example |
| "बोलें" (speak) | Runs the closed-grammar recogniser |
| Confirm dialog | Reads the parsed answer back with confidence % and source; `पुष्टि करें` / `नहीं, बदलें` |
| Confirmed facts list | Field, confidence, source (voice / icon / facilitator / form) |
| "फ़ॉर्म से भरें" | Bulk form entry |
| Next-step button | Jump to career options |

Nothing becomes a fact until you confirm it; low confidence never silently becomes truth.

### 7.5 Discover (`#/discover`)

| Element | Meaning |
|---|---|
| Kicker "CAREER DISCOVERY", count, sub-line | What the list is and that it is not an AI guess |
| Cluster chips: All · Vocational · Technical · Academic · Enterprise · Services | Filter by cluster |
| Career cards | Rank `#n`, cluster, title, one-line summary, fit %, wage band, distance, duration |
| "How is this ranked?" | The published formula (interest .30, skill .25, cost .15, distance .15, prerequisites .10, gap −.05, then diversity re-rank) |
| Pack footer | Pack name, version, option count |

Vocational and non-STEM options are deliberately kept in the top six.

### 7.6 Career detail (`#/career/:id`)

Cluster kicker · title · summary · score breakdown meters (interest, skill, cost, distance,
prerequisites, gap) · pathway steps · start-plan action.

### 7.7 Plan (`#/plan`)

Pathway for the chosen career: step list with completion state, progress meter, and per-step
"mark done" which writes a signed `PathwayStepRecorded` event. If no career is chosen yet the
screen asks you to start from the profile.

### 7.8 Act — eligibility (`#/act`) and scheme detail (`#/act/:schemeId`)

| Element | Meaning |
|---|---|
| Filter chips | All · Eligible · Need info · Not eligible |
| Scheme cards | Level, name, outcome badge, freshness chip |
| Detail: outcome + rule citations | Which rule produced the answer, its pack version, source and date |
| Document checklist | What is missing (`NEED_INFO`) and where to take it |
| Deadline / office / helper | The next-step card contents |
| Speak button | Reads the guidance aloud |

The third answer — *need info* — is a feature, not a failure.

### 7.9 Prove — Skill Passport (`#/prove`)

| Element | Meaning |
|---|---|
| Header count badge | Credentials in this account's wallet |
| Empty state | "A facilitator issues a credential after an assessment" → open the hub |
| Credential cards | Skill, status badge (Valid / Check online / Invalid), issued and valid-until dates, issuer key id |
| QR modal | The signed envelope as a QR, plus status, issuer org, registry age in days, evidence hash |
| Honesty callout | A signature proves who issued it and that nothing changed — not that the assessment was fair |
| "Verify like a third party" | Opens the verifier |

### 7.10 Verify (`#/verify`)

Paste or scan a credential QR. Shows VALID / INVALID / POSSIBLY_REVOKED, issuer organisation,
registry age, and the revocation (Bloom) check. Works with no network from the cached registry.

### 7.11 Credits (`#/credits`)

| Element | Meaning |
|---|---|
| Allowance lease card | Cap, remaining, expiry, spend meter, pending settlement count |
| Mint section | Lists VALID credentials at the pool's milestone; `Mint` creates a counted token |
| Tokens table | Counter, amount, status (minted / redeemed / settled / flagged), `Use` action |
| "Settle at sync" | Sends tokens for reconciliation; duplicates are flagged, never double-paid |
| Pool rule block | Pool id, milestone, module, sponsor |
| Disclaimer | Simulated, non-cash entitlement — Sopaan is not a lender or payment provider |

### 7.12 Sync and packs (`#/sync`)

Server address · `Sync now` · `New pack` · queue / acked / rejected counters · active pack
(expiry, reviewers `n/3`, registry version and date) · installed versions · file channel
(`Bring a new pack`, `Older pack`, file input) · event log table `# / type / status` · notes on
the 200-event batch limit and segment pruning.

### 7.13 Hub — facilitator (`#/hub`)

Roster table (alias, class, missing documents, credential count) · assessment and issuing
(student select, skill select, level, evidence, lease callout, **Sign and issue**) · assessment
steps with `Done` · modules and revenue share (price, facilitator share) · issued modal with QR ·
footnote that the demo hub key is published.

The roster starts with **the learner signed in on this device** and grows from accounts that
actually enrol against this hub.

### 7.14 Review — rule governance (`#/review`)

A proposed rule change with each criterion quoting its source · citation checks · golden tests ·
co-signature list · publish gate (two of three signatures **and** green golden tests). Optionally
asks the FastAPI extractor at `:8000`; if it is not running the bundled proposal is shown.

### 7.15 Sponsor view (`#/sponsor`)

Aggregate-only outcomes: released-against-proof total, valid credentials, flagged tokens, pool
funding meters, spend by skill. No student identity, name or contact ever appears here.

### 7.16 Settings (`#/settings`)

| Block | Meaning |
|---|---|
| **Account** | Username, role, account id, live-status badge, `Sign out`; or Login / Sign up prompts when anonymous |
| Appearance | Night (default) / Daylight |
| Language | हिंदी · मराठी · English |
| Consent | Guardian consent, cloud speech, aggregate counters — versioned `consent-2026-10` |
| Device identity | Device id, student id, key id, public key (the private key never leaves the phone) |
| Measured on this phone | JS+CSS size, pack-verify time, date — labelled as measured, not targets |
| Installed packs | Version list with `Activate` for rollback |
| Honest limits | Hindi ASR not bundled, credits simulated, dev keys public, re-verify rules, LAN sync absent |
| Delete local data | Clears **this account's** store only |

### 7.17 Tour (`#/tour`) — Radha's eight steps

The one deliberate demo. Eight steps from discovery to proof and from proof to funding; each
step states what is real and what is simulated, and the whole tour runs with the network off.

### 7.18 More (`#/more`)

Skill-passport summary card + four groups of links: *Learn and plan* (Discover, Plan, Act),
*Proof and funding* (Prove, Verify, Credits), *Facilitator and governance* (Hub, Review, Sponsor),
*System* (Sync, Settings, Tour, About).

### 7.19 404

Any unknown hash route renders a 404 card with a link home.

---

## 8. What to do in this project (task map)

**As a learner (works today)**

1. Register, then sign in — you land on Discover.
2. Profile → answer seven questions, confirming each; watch the completion rise.
3. Discover → compare fit, wage, distance; open one path.
4. Plan → mark pathway steps done (they sign and queue as events).
5. Act → read which schemes are eligible, which need documents, and why.
6. Prove → open a credential's QR; Verify it from `#/verify`.
7. Credits → mint against a valid credential, then settle at sync.
8. Sync → watch queued events become acked, and the registry refresh.
9. Settings → confirm your account, live status, and that Delete only affects your own store.

**As the operator of this build**

* Keep both processes running; the app is not useful without the API for login/sync.
* Reset everything: stop the server, delete `server/data/sopaan*`, restart (Flyway re-migrates).
* Regenerate signed packs: `npm run packs` (root scripts in `package.json`).
* Rebuild the PWA: `cd web && npm run build`.

**Where to extend**

| Want to | Touch |
|---|---|
| Add or change a scheme rule | `packs/schemes-mh/*.json` → `tools/build-packs.mjs` (signs + verifies) |
| Add a career | pack `catalogue.careers` + `core/scoring.ts` weights |
| Add a UI screen | `web/src/features/*.tsx` + a `case` in `web/src/app.tsx` + a link in `More.tsx` |
| Add an API | a package under `server/src/main/java/com/sopaan/<module>` with controller + service |
| Change live behaviour | `server/.../realtime/RealtimeHub.java`, `web/src/data/realtime.ts` |
| Add a schema change | `server/src/main/resources/db/migration/V5__*.sql` (never edit V1–V4) |

---

## 9. Demo vs. real, stated plainly

**Real, end to end:** accounts and login (BCrypt + JWT), per-account local stores, server-side
account scoping, device-to-account binding, event signing/verification, eligibility evaluation
from signed packs, pathway progress, credential verification, credit lease/counter/settlement
arithmetic, sync with idempotent ingest and high-water-mark acks, live per-account updates,
cohort dashboard API, audit log.

**Deliberately simulated (per the design, and labelled in the UI):** credit values are
non-cash entitlements — no UPI, no lender, no award decision.

**Still simulated or external (nothing else):**

1. **Credit values are non-cash** — the design's own rule. Tokens, caps, counters and settlement
   arithmetic are real; the money is not, and the UI says so.
2. **Rule packs are unverified against official portals.** Sources and last-verified dates are
   from the design's fieldwork window; re-verify before any real application.
3. **The offline speech model is an operator step.** `web/src/voice/offline.ts` drives a Vosk
   WASM recogniser with the question's closed grammar; the model directory is empty in this repo.
   Until a model is dropped into `web/public/models/vosk-hi/`, the app reports the keyboard tier
   honestly instead of pretending a microphone worked.
4. **One demo case on the verify screen is signed in the browser.** The “revoked” sample needs a
   signature the registry will accept, so it is signed with the published dev issuer key that
   `web/src/generated/demo-keys.json` carries (the screen labels it, and the file is marked DEV
   ONLY). Nothing the user issues goes through that path any more — issuing is server-side.
5. **Deployment** (Neon, Render, static host, pg_dump job, LAN hub sync) is out of this build.

## 9.1 What was closed, and how it is checked

| Gap that used to exist | Now | Check |
|---|---|---|
| Hub signed credentials with a published dev key | `POST /v1/credentials` signs on the server under the leased, scoped issuer key; the browser holds no private key | issued a credential as `FACILITATOR`; browser→server flow in the Hub screen |
| Roles could not be granted | `POST /v1/admin/users/{username}:grant-role` (ADMIN), audited; Settings → Roles UI; `sopaan.admin.bootstrap` seeds the first admin | student → 403; admin grant → 200; a STUDENT token cannot reach it |
| Review screen used a bundled sample | server truth: `/v1/admin/rules`, `…/golden`, `…/signatures`, `…:approve` | 34/34 golden cases green, two distinct account seats = PUBLISHABLE |
| Quorum could be spoofed by a body-supplied key id | seats are allocated per account (`review_seat`); re-signing from one account never advances quorum | second approval from the same account left `reviewers: 1` |
| Consent was local-only | `/v1/consent` records it server-side with the account's own student; Settings mirrors the result | POST + GET return the record, `precedence: "server"` |
| No rate limiting | token bucket on `/v1/sync/push`, auth and credential/credit routes; 429 with `Retry-After` | 11 logins through, then 429 |
| Sponsor pools were constants | `GET /v1/credits/pools` feeds the view when the account is SPONSOR/FACILITATOR/ADMIN, with a badge saying which source it used | screen shows `pools from server` for an authorised role |
| No offline speech tier | `voice/offline.ts`: Vosk bridge + closed grammar per question, tier reported in the UI | tier badge reads offline / online / icons |
| No property, boundary, browser or load tests | fast-check (web), jqwik + ArchUnit (server), Playwright airplane-mode suite, k6 script, ZAP script, CI job | see §9.2 |

## 9.2 Test inventory

```
web  npx tsc --noEmit                 types
web  npx vitest run                   30 tests (25 golden + 5 property)
web  npx playwright test              2 airplane-mode tests against a production build
srv  ./mvnw.cmd test                  16 tests (signature, TS/Java parity, 6 jqwik properties, 4 ArchUnit rules)
srv  k6 run tools/load/sync-burst.js  sync burst, p95 < 500 ms budget
tools/zap-baseline.sh                 OWASP ZAP passive baseline
```

Load test, k6 v2.3.0 on this machine (30 VUs × 2 iterations, 40 signed events per push,
60 pushes in 0.7 s against the local API):

```
http_req_duration{expected_response:true}  p(95) = 166.54 ms   (budget 500) ✓
                                           avg 106.4 ms, min 35.8 ms, max 168.4 ms
http_req_failed                            0.00%   (0 of 60)   ✓
sync_rate_limited                          0.00%   (0 of 60)
checks                                     120/120 ✓
```

k6 is not committed: download `k6-v2.3.0-windows-amd64.zip` into `tools/bin/` (git-ignored) or
install it with winget, then run

```bash
TOKEN=$(curl -s -X POST localhost:8080/v1/auth/login -H 'content-type: application/json' \
  -d '{"username":"isob","password":"TestPass1"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
tools/bin/k6-*/k6.exe run -e API=http://localhost:8080 -e TOKEN="$TOKEN" tools/load/sync-burst.js
```

The threshold uses k6's `p(95)` form; the bare `p95` alias was rejected by k6 v2 at parse time.

---

## 10. API quick reference

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /v1/auth/register` | public | Create account + student, return JWT |
| `POST /v1/auth/login` | public | Verify password, return JWT |
| `GET /v1/auth/me` | any token | The caller's own account record |
| `POST /v1/devices:enroll` | public (token optional) | Enrol a device key; binds it to the signed-in account when a token is sent |
| `POST /v1/sync/push` | STUDENT / DEVICE / FACILITATOR / HUB / ADMIN | Idempotent signed-event ingest, scoped to the caller's student |
| `GET /v1/sync/pull` | same | Pack + registry manifest, conflicts |
| `GET /v1/realtime/stream` | STUDENT / DEVICE / … | SSE live frames for the caller's own student |
| `GET /v1/realtime/status` | same | Subscriber count for the caller's student |
| `POST /v1/credentials` | FACILITATOR / ADMIN / HUB | Issue a credential envelope |
| `GET /v1/credentials/{id}` | public | Fetch the signed envelope (verification is offline) |
| `POST /v1/credentials/{id}:revoke` | FACILITATOR / ADMIN | Revoke with reason |
| `GET /v1/registry/snapshot` | public | Signed issuer registry |
| `GET /v1/cohorts` | FACILITATOR / REVIEWER / ADMIN | Cohorts the caller may see |
| `POST /v1/cohorts` · `/{id}/members` · `GET /{id}/dashboard` | FACILITATOR / ADMIN | Cohort roster and aggregate progress |
| `POST /v1/credits/pools` | SPONSOR / ADMIN | Register a sponsor pool |
| `POST /v1/credits/allowances` · `/settle` · `GET /pools` | roles above | Lease, settle, report |
| `GET` `/v1/packs/{name}/{version}` | public | The rule pack itself, byte-identical to the signed manifest digest |
| `GET` / `POST /v1/consent` | any enrolled role | Cloud-authoritative consent record for the caller's own student |
| `GET /v1/admin/users` | ADMIN | Accounts with roles and student binding |
| `POST /v1/admin/users/{username}:grant-role` | ADMIN | Grant / revoke a role (audited) |
| `GET /v1/admin/rules/{pack}/signatures` | REVIEWER / ADMIN | Seats, quorum, golden status |
| `POST /v1/admin/rules/{pack}:approve` | REVIEWER / ADMIN | Co-sign; seat is derived from the account |
| `GET /v1/meta` | public | Profile, demo flag, pack/registry versions |
| `GET /actuator/health` | public | Liveness |

Every mutating route is origin-checked and rate-limited (`429` + `Retry-After`); sync push is
60/min per token, auth 12/min per IP.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Cannot reach the server…" on login | API not running, or `sopaan_server_url` points elsewhere | Start `server`, set `localStorage.sopaan_server_url` to the API origin |
| `invalid_credentials` with a password you know | stored BCrypt hash differs from the current encoder for that row | register a fresh username, or re-hash that row server-side |
| `username_or_email_exists` on a "new" name | username already taken (case-insensitive) | pick another username |
| Sync shows `forbidden_role` | an old build called sync without a STUDENT-capable role | restart the API; signed-in accounts are allowed now |
| Live badge stays `reconnecting` | API restarted, or the tab is offline | it reconnects with backoff; check `/v1/realtime/status` |
| Profile empty after sign-in | each account gets its own store by design | answer the intake once for this account |
| App boots to "Could not start" | bundled signed pack/registry failed verification | check `web/src/generated/*.json`, rebuild packs |

---

## 12. File map

```
web/                 Preact + TypeScript PWA
  src/app.tsx        hash router; auth-aware root
  src/state.ts       reactive store, bootstrap, account switch, live stream
  src/data/          db (per-account IndexedDB), auth, sync, realtime, packs, profile,
                     outbox, wallet, credits, hub, review
  src/core/          rules3v, scoring, pathway, envelope, crypto, verify, bloom, ids, format
  src/features/      one file per screen
  src/voice/         grammar, stt, tts
  src/generated/     bundled signed pack / registry / dev keys
server/              Spring Boot 3 modular monolith
  .../auth           AuthController, AuthUserService (BCrypt)
  .../security       AuthFilter, Auth, JwtService, StudentScope
  .../sync           SyncController, SyncService (scoped ingest)
  .../realtime       RealtimeHub (SSE), RealtimeController, RealtimeService, WebSocketConfig
  .../rules          PackService, JsonLogic3v, ReviewController
  .../passport       CredentialService, RegistryService, Bloom
  .../credits        CreditController, CreditService
  .../cohort, audit, common, config
  resources/db/migration  V1 init · V2 seed · V3 rejected · V4 auth users
ai/                  FastAPI sidecar (optional)
packs/               signed artifacts + registry + test vectors
tools/               keygen, pack builder/signer, verifier CLI
```

---

*Status note: this build is a hackathon-grade reference implementation. Every number the design
documents mark "target" is a proposal, not a measured result — including the size, latency and
verification-time figures quoted in the UI, which are labelled as targets where they appear.*
