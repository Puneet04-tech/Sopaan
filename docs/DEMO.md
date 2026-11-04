# Eight-step demo

Radha, 17, class 12, OBC, family income ₹1.8 lakh, wants to become a tailor. The script shows the
whole chain, including the honest parts: a rule that says **not eligible**, a missing field that says
**need info**, and credits that are simulated.

## Before you start

```bash
npm run setup                 # installs deps and regenerates the signed packs
npm run dev:web               # http://127.0.0.1:5173
# optional, for live rule drafting and the hub screens:
npm run dev:server            # http://localhost:8080  (H2, seeded, demo mode)
npm run dev:ai                # http://localhost:8000  (optional)
```

Open DevTools → Application → Local Storage/IndexedDB and clear site data for a fresh device, or use
a second browser profile. The app boots into Hindi; the language switch is in **More**.

## The script

### 1. Profile — say it once

**Profile** → answer the five questions (class, income, category, gender, marks). Use the microphone
if you like; the UI tells you whether recognised speech, the on-device grammar or the icon picker was
used. Save. The card shows which fields are still unknown — nothing is guessed.

Expected: a completeness ring and `family_income = 1,80,000`.

### 2. Discover — a real three-valued answer

**Discover** → filter by *scholarship*. Open **Post Matric Scholarship — OBC**.

Expected:
- `ELIGIBLE` if class ≥ 11, OBC category and income ≤ ₹2.5 lakh.
- `NOT_ELIGIBLE` with the failing rule and its source if the income is above the ceiling.
- `NEED_INFO` naming the field if something is missing.

Point at the freshness badge and the quoted source. This is the project's core claim: an answer you
can audit, not a chatbot sentence.

### 3. Plan — a pathway, not a brochure

**Plan** → choose *Tailoring — Level 1 → 2*. The pathway shows steps, hours, the nearest ITI and the
assessor. Mark the first step done.

Expected: the step is stored locally and an outbox event is appended. Turn the network off now.

### 4. Act — the Next-Step Card works offline

With DevTools offline (or airplane mode), open the card for the scholarship.

Expected: documents, deadline, office and helper still render from the cached pack. A banner says the
data is from the installed pack version and when it was verified. Nothing spins forever.

### 5. Prove — a signed credential

Stay offline. **Prove** → *Tailoring Level 2* → record evidence (three garments, assessor note) →
issue.

Expected: a credential appears with a QR code and a short id. The signature was created on the device
with the demo issuer key and verifies locally. The screen labels the key **DEV**.

### 6. Verify — including the failure cases

**Verify** → scan/paste the credential id.

Expected: `VALID`, issuer, skill, level, epoch, and the registry snapshot used. Then:
- edit one character in the id → `NOT FOUND`;
- use the tampered fixture in `packs/vectors/` if you are testing the CLI → `BAD SIGNATURE`;
- revoke the credential from **Hub** if the server is running, then re-verify → `REVOKED`.

Turn the network back on.

### 7. Release — credits unlock against proof

**Credits** → *Receive allowance* (paste the demo allowance if prompted) → mint 2 tokens → settle.

Expected with the server running: `settled: 2`, remaining pool decreases, and the ledger shows
**SIMULATED** amounts. Settle the same tokens again: no double spend. Reuse a counter: the response
flags `counter_reuse` and keeps the original settlement.

### 8. Sync and hub — the facilitator view

**Sync** → *Enroll this device* (server running) → *Push*. Then open **Hub** on the same server:
add Radha to the demo cohort, open the dashboard.

Expected: `acked_upto` advances past rejected events too; the dashboard shows aggregate counts only,
no other learner's PII. **Review** shows the 2-of-3 co-sign gate and the golden-test result; a pack
cannot become publishable with one signature.

Finally open **More → Measured on this device**: bundle size and live verification timing, labelled
as measurements — not the design document's targets.

## Reset

```bash
# browser: DevTools → Application → Clear site data
rm -rf server/data            # H2 demo database (stop the server first)
npm run packs                 # regenerate deterministic signed artifacts
```

## If something is missing

| Symptom | Cause | Fix |
|---|---|---|
| Hub/Sync says 401 | device not enrolled or token expired | enroll again (one hour TTL) |
| Live rule draft does not appear | AI sidecar not running | start `npm run dev:ai`; the bundled sample is used otherwise |
| Credit settle says `unknown_issuer` | registry snapshot not current | pull once with the server running |
| Credential verifies as `ISSUER_UNKNOWN` | pack/registry mismatch | reinstall the latest pack from Sync |
