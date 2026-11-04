# Implementation plan

Derived from `Sopaan_Unified_System_Design.pdf` (§5.1–5.7, §9.2), the 8-page solution document and
the architecture diagram. Build order follows the design's own §9.2 so every step is demoable on
its own.

| # | Step | Deliverable in this repo | Done when |
|---|---|---|---|
| 1 | Repository + signed artifacts | `tools/`, `packs/`, dev keystore | Both the Node and browser verifiers accept the generated pack; a tampered byte is rejected |
| 2 | Crypto + rules core | `web/src/core/{crypto,envelope,rules3v,bloom,ids,verify}.ts` | Shared golden vectors pass; three-valued edge cases covered |
| 3 | Local store + WAL outbox | `web/src/data/*`, Dexie schema v1 | State change and event commit in one transaction; segments drop at the high-water mark |
| 4 | PWA shell + design system | `web/src/{app,styles,components}` | Installable, shell + core pack under the 2 MB target, i18n (hi/en/mr) |
| 5 | Five-link UI | `web/src/features/*` | Discover → Plan → Act → Prove → Release all work offline |
| 6 | Sync engine + transports | cloud, file, QR adapters | Idempotent push, high-water prune, pull + atomic pack swap |
| 7 | Spring Boot cloud + hub | `server/` | Same jar, two profiles; all §5.2.2 endpoints; golden parity — 27/27 e2e checks, 6 JUnit tests |
| 8 | FastAPI sidecar | `ai/` | Four endpoints + fairness CLI; deterministic fallback when no LLM key — 8 pytest checks |
| 9 | Reviewer + sponsor + hub UI | `web/src/features/{Reviewer,Hub,Sponsor}` | 2-of-3 co-sign gate, aggregate-only sponsor view |
| 10 | Delivery | CI, docs, demo | CI workflow provided; 8-step demo script; the three processes run from source |

## Deliberate deviations (and why)

| Design says | Built here | Reason |
|---|---|---|
| Vosk WASM Hindi model bundled | Adapter + Web-Speech path + icon fallback | The model is tens of MB; the design itself budgets the voice model as a separate optional download. The UI never pretends offline STT ran when it did not. |
| Neon Postgres in cloud | H2 by default, Postgres profile provided | Keeps the demo runnable with no account. Same Flyway migrations, `postgres` profile in `application-cloud.yml`. |
| LLM for rule extraction | Deterministic extractor + optional OpenAI-compatible adapter | Works with no key; the output is always `PROPOSED` and cannot be published without 2-of-3 signatures. |
| ArcUnit dependency rules | Package structure + explicit module boundaries | Same intent, one less dependency on the free tier. |
| Container-based delivery | Direct Node/JDK/Python processes | Keeps the documented path to one that was actually run and verified on this machine. |

## Targets vs results

The design's NFR table is preserved as *targets*. The PWA shows a "Measured on this device" panel
(bundle size from the build report, offline verify timing taken live) so a reviewer can see what was
actually observed rather than a copied number.
