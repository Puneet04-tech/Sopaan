// End-to-end smoke test against a locally running server (`profile=cloud`, demo mode).
// Usage: node tools/e2e-server.mjs   (server must be on http://127.0.0.1:8080)
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson, deriveKey, signEnvelope, utf8, verifyEnvelope } from "./lib/envelope.mjs";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const BASE = process.env.SOPAAN_BASE ?? "http://127.0.0.1:8080";
const keys = JSON.parse(readFileSync(new URL("./dev-keys.json", import.meta.url), "utf8")).keys;
const rootKid = keys.root.kid;
let failures = 0;
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(method, path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

async function enroll(role) {
  const seed = randomBytes(32);
  const identity = deriveKey(Buffer.from(seed).toString("hex"));
  const deviceId = randomUUID();
  const studentId = randomUUID();
  const response = await call("POST", "/v1/devices:enroll", {
    device_id: deviceId,
    student_id: studentId,
    pubkey: identity.publicKey,
    role,
  });
  return { ...identity, deviceId, studentId, token: response.body?.token, enroll: response };
}

function signEvent(identity, seq, type, payload) {
  const body = { event_id: randomUUID(), device_id: identity.deviceId, seq, type, payload, ts: Date.now() };
  const signature = ed.sign(utf8(canonicalJson(body)), Buffer.from(identity.privateKey, "base64url"));
  return { ...body, sig: Buffer.from(signature).toString("base64url") };
}

// ---------------------------------------------------------------- health & auth
const meta = await call("GET", "/v1/meta");
check("meta is public", meta.status === 200 && meta.body?.service === "sopaan", `pack ${meta.body?.pack?.version}`);
check("demo mode is on for this profile", meta.body?.demo_mode === true);

const unauth = await call("GET", "/v1/credits/pools");
check("protected endpoint rejects anonymous callers", unauth.status === 401, String(unauth.body?.error));

// ---------------------------------------------------------------- learner sync
const learner = await enroll("DEVICE");
check("learner enrolment returns a token", learner.enroll.status === 200 && !!learner.token, learner.enroll.body?.role);

const event1 = signEvent(learner, 1, "ProfileFieldConfirmed", { field: "class_level", value: 10, conf: 0.9, source: "self" });
const push1 = await call("POST", "/v1/sync/push", { events: [event1] }, learner.token);
check("signed event accepted", push1.status === 200 && push1.body?.acked_upto === 1, `acked ${push1.body?.acked_upto}`);

const pushAgain = await call("POST", "/v1/sync/push", { events: [event1] }, learner.token);
check("duplicate push is idempotent", pushAgain.status === 200 && pushAgain.body?.acked_upto === 1);

const tampered = { ...signEvent(learner, 2, "ProfileFieldConfirmed", { field: "income", value: 1 }), payload: { field: "income", value: 999999 } };
const pushTampered = await call("POST", "/v1/sync/push", { events: [tampered] }, learner.token);
check("tampered event rejected", pushTampered.body?.rejected?.[0]?.code === "bad_signature", JSON.stringify(pushTampered.body?.rejected));

const event3 = signEvent(learner, 3, "PathwayStepRecorded", { pathway_id: "path-tailor", step: "docs" });
const push3 = await call("POST", "/v1/sync/push", { events: [event3] }, learner.token);
check("rejected seq is skipped, later seq still ingests", push3.body?.acked_upto === 3, `acked ${push3.body?.acked_upto}`);

const pull = await call("GET", "/v1/sync/pull?cursor=", undefined, learner.token);
check("pull advertises the pack and registry", pull.status === 200 && pull.body?.packs?.[0]?.version === "2026.10.14-1");
check("pull includes a registry URL", pull.body?.registry?.url === "/v1/registry/snapshot");

// ---------------------------------------------------------------- registry
const snapshot = await call("GET", "/v1/registry/snapshot");
const verifiedRegistry = verifyEnvelope(snapshot.body, { [rootKid]: keys.root.publicKey });
check("registry snapshot verifies against the pinned root", verifiedRegistry.ok, verifiedRegistry.errors?.join(","));
check("registry lists two issuers", snapshot.body?.payload && JSON.parse(Buffer.from(snapshot.body.payload, "base64url").toString()).issuers.length === 2);

// ---------------------------------------------------------------- facilitator & credentials
const facilitator = await enroll("FACILITATOR");
check("facilitator role is granted in demo mode", facilitator.enroll.body?.role === "FACILITATOR");

const issued = await call("POST", "/v1/credentials", {
  subject_id: learner.studentId,
  skill: "TAILOR.L2",
  level: 2,
  evidence_label: "Blouse construction assessment — 14 Oct 2026",
}, facilitator.token);
check("credential issued under a scoped issuer key", issued.status === 200 && issued.body?.envelope?.kid === keys["issuer-hub-1"].kid);
const credId = issued.body?.credential?.id;

const outOfScope = await call("POST", "/v1/credentials", {
  subject_id: learner.studentId,
  skill: "DRONE.L1",
  level: 1,
  evidence_label: "unsupported",
}, facilitator.token);
check("out-of-scope skill refused", outOfScope.status === 403, String(outOfScope.body?.error));

const fetched = await call("GET", `/v1/credentials/${credId}`);
check("credential envelope is publicly verifiable", fetched.status === 200 && fetched.body?.typ === "cred");

// ---------------------------------------------------------------- credits
const allowancePayload = {
  allow: randomUUID(),
  pool: "POOL-SKILL-2026",
  device: learner.deviceId,
  cap: 3000,
  ctr_start: 0,
  exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  milestone: "TAILOR.L2",
  currency: "SIM",
};
const allowance = signEnvelope({
  privateKey: keys.sponsor.privateKey,
  publicKey: keys.sponsor.publicKey,
  typ: "allowance",
  payload: allowancePayload,
});

function tokenFor(ctr, amount) {
  const payload = { tok: randomUUID(), allow: allowancePayload.allow, cred: credId, amt: amount, ctr, iat: Math.floor(Date.now() / 1000) };
  const envelope = signEnvelope({ privateKey: keys["issuer-hub-1"].privateKey, publicKey: keys["issuer-hub-1"].publicKey, typ: "token", payload });
  return { ...payload, envelope };
}

const token1 = tokenFor(1, 1500);
const settle = await call("POST", "/v1/credits/settle", {
  allowance,
  tokens: [{ token_id: token1.tok, allow_id: token1.allow, cred_id: token1.cred, amount: token1.amt, ctr: token1.ctr, envelope: token1.envelope }],
}, learner.token);
check("token settles and decrements the pool", settle.status === 200 && settle.body?.settled?.includes(token1.tok), JSON.stringify(settle.body?.flagged));

const settleAgain = await call("POST", "/v1/credits/settle", {
  tokens: [{ token_id: token1.tok, allow_id: token1.allow, cred_id: token1.cred, amount: token1.amt, ctr: token1.ctr, envelope: token1.envelope }],
}, learner.token);
check("settlement is idempotent", settleAgain.body?.settled?.includes(token1.tok));

const reused = tokenFor(1, 1500);
const reuse = await call("POST", "/v1/credits/settle", {
  tokens: [{ token_id: reused.tok, allow_id: reused.allow, cred_id: reused.cred, amount: reused.amt, ctr: reused.ctr, envelope: reused.envelope }],
}, learner.token);
check("counter reuse is flagged", reuse.body?.flagged?.includes(reused.tok), JSON.stringify(reuse.body?.reasons));

const overCap = tokenFor(2, 2000);
const capResult = await call("POST", "/v1/credits/settle", {
  tokens: [{ token_id: overCap.tok, allow_id: overCap.allow, cred_id: overCap.cred, amount: overCap.amt, ctr: overCap.ctr, envelope: overCap.envelope }],
}, learner.token);
check("lease cap is enforced", capResult.body?.flagged?.includes(overCap.tok), JSON.stringify(capResult.body?.reasons));

const badAllowance = signEnvelope({
  privateKey: randomBytes(32).toString("base64url"),
  publicKey: keys.sponsor.publicKey,
  typ: "allowance",
  payload: allowancePayload,
});
const bad = await call("POST", "/v1/credits/settle", { allowance: badAllowance, tokens: [] }, learner.token);
check("forged allowance refused", bad.status === 400, String(bad.body?.error));

// ---------------------------------------------------------------- review
const reviewer = await enroll("REVIEWER");
const packId = encodeURIComponent("schemes-mh@2026.10.14-1");
const golden = await call("GET", `/v1/admin/rules/${packId}/golden`, undefined, reviewer.token);
check("golden vectors pass server-side", golden.status === 200 && golden.body?.pass === true, `${golden.body?.cases?.length} cases`);

const review1 = await call("POST", `/v1/admin/rules/${packId}:approve`, { reviewer_kid: keys["reviewer-1"].kid }, reviewer.token);
check("one signature keeps the pack in review", review1.body?.status === "REVIEWING", String(review1.body?.status));
const review2 = await call("POST", `/v1/admin/rules/${packId}:approve`, { reviewer_kid: keys["reviewer-2"].kid }, reviewer.token);
check("second signature publishes", review2.body?.status === "PUBLISHABLE", String(review2.body?.status));

// ---------------------------------------------------------------- cohort
const cohort = await call("POST", "/v1/cohorts/demo-cohort-01/members", { student_id: learner.studentId }, facilitator.token);
check("facilitator can add a learner", cohort.status === 200);
const dashboard = await call("GET", "/v1/cohorts/demo-cohort-01/dashboard", undefined, facilitator.token);
check("dashboard reports the roster", dashboard.status === 200 && dashboard.body?.totals?.learners >= 1, JSON.stringify(dashboard.body?.totals));

// ---------------------------------------------------------------- audit
const audit = await call("GET", "/v1/audit?limit=5", undefined, facilitator.token);
check("audit is admin-only", audit.status === 403 || audit.status === 401);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
