# SOPAAN — *Every step, signed.*

An offline-first learning-to-livelihood platform for rural India. A student speaks her goal, gets a
guidance answer that cites a reviewed rule, walks a pathway, gets a skill signed by an authorised
assessor, and lets sponsor credit unlock against that proof — with or without a network.

> **Provenance.** This build implements the design in `Sopaan_Unified_System_Design.pdf`,
> `Sopaan_Hackathon_Solution_8pg.pdf`, `sopaan tech-stack.pdf` and `sopaan_architecture.png`.
> Every number in those documents marked "target" is a proposal, not a measured result, and this
> repository keeps that discipline: the UI labels demo packs, demo keys and simulated credits.

---

## The five-link chain

| Link | Artifact | Who signs / checks | Where |
|---|---|---|---|
| 1. Signed rule pack | versioned rules + sources + golden cases | 2-of-3 reviewers | `packs/`, `tools/build-packs.mjs`, `server/.../rules` |
| 2. Eligibility result | `ELIGIBLE` / `NOT_ELIGIBLE(rule)` / `NEED_INFO(fields)` | computed on device, cites rule + pack version + source + date | `web/src/core/rules3v.ts` |
| 3. Next-Step Card | documents, deadline, place, helper, Family Voice | freshness badge on every result | `web/src/features/Act.tsx` |
| 4. Signed credential | Ed25519 envelope, QR-verifiable offline | leased issuer key, epoch fencing, Bloom revocation | `web/src/core/verify.ts`, `server/.../passport` |
| 5. Credit release | capped allowance lease + counted token | mint requires valid credential; settle dedupes | `web/src/data/credits.ts`, `server/.../credits` |

## Three tiers

```
 TIER 1  Student / verifier PWA      web/            works with zero network after install
 TIER 2  Facilitator hub             server/ (hub)   same jar, H2, leased issuer key
 TIER 3  Cloud                       server/ (cloud) + ai/ + Neon Postgres
```

The same Spring Boot artifact runs in both profiles. FastAPI is an optional sidecar: killing it
loses no decision, credential, credit or sync.

## Repository map

```
web/                 Vite + Preact + TypeScript PWA (Workbox, Dexie, json-logic, @noble/ed25519)
server/              Spring Boot 3 modular monolith: rules, passport, sync, cohort, credits, audit
ai/                  FastAPI: rules:extract, profile:extract, explain, packs:validate, fairness CLI
tools/               dev keygen, pack builder/signer, standalone verifier CLI
packs/               generated signed artifacts (schemes, catalogue, registry, audio index)
docs/                implementation plan, architecture, API, demo script, threat model
```

## Quick start

```bash
# 0. Node 20+, JDK 17+, Python 3.11+
npm run setup            # installs web + tools deps, builds signed packs

# 1. Student PWA (offline-first; works with no backend at all)
npm run dev:web          # http://localhost:5173

# 2. Cloud backend (H2 in-memory profile, seeded)
npm run dev:server       # http://localhost:8080

# 3. Optional AI sidecar (deterministic fallbacks without a key)
npm run dev:ai           # http://localhost:8000

# 4. Everything in one command (hub profile, as a facilitator would run it)
docker compose up --build
```

Open the PWA, tap **Demo tour** and follow Radha's eight steps. Turn the network off (DevTools →
Network → Offline, or airplane mode) before step 4: the chain keeps working from the cached pack.

### Verified locally

- `npm run build:web` — typecheck + production PWA build.
- `npm run test:web` — unit tests for 3-valued rules, envelope, scoring, Bloom, credits.
- `npm run packs` — regenerates signed packs and verifies every signature.
- `npm run test:server` — JUnit: golden parity with the TypeScript suite, crypto, idempotent sync.
- `npm run test:ai` — FastAPI contract tests + fairness harness.
- `npm run verify:pack packs/schemes-mh/*.json` — third-party verification in ~40 lines of Node.

## Honest limits (kept from the design)

- Vosk's Hindi model is **not bundled** (it is a separate optional download). The voice pipeline
  ships a closed-grammar recogniser adapter, Web-Speech upgrade path, and an always-available icon
  picker; the UI says which one was used.
- Credits are **simulated, non-cash entitlements**. No UPI, no lender, no award decision.
- Demo issuer/pack keys live in `tools/dev-keys.json` and are clearly marked **DEV ONLY**. The app
  pins the dev root public key; a production build must replace it.
- The seeded scheme rules carry source URLs and last-verified dates from the design's fieldwork
  window. Re-verify before any real use.
- LAN hub sync is a labelled stretch goal (needs locally trusted HTTPS). QR, file and cloud carry
  signed artifacts today.

## Docs

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — build order and status
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — HLD/LLD as built
- [`docs/API.md`](docs/API.md) — REST + FastAPI contracts
- [`docs/DEMO.md`](docs/DEMO.md) — Radha's eight-step script
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model, keys, privacy
