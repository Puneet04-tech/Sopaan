import { useEffect, useState } from "preact/hooks";
import QRCode from "qrcode";
import { formatDate, formatRupees } from "../core/format";
import type { Envelope } from "../core/envelope";
import {
  completedSteps,
  issueCredential,
  markAssessmentComplete,
  moduleRevenue,
  roster,
  SKILL_OPTIONS as HUB_SKILLS,
} from "../data/hub";
import { pickLocalised } from "../i18n";
import type { RosterRow } from "../data/db";
import { api } from "../data/api";
import { canFacilitate, currentRole } from "../data/roles";
import { cohortMembers, type CohortMember } from "../data/hub";
import { identity, lang, notify, pack, refreshLocal, registry, wallet } from "../state";
import { Badge, Icon, Modal, PageHead } from "../components/ui";

export function Hub() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [students, setStudents] = useState<RosterRow[]>([]);
  const currentStudentId = identity.value?.studentId ?? "";
  const [studentId, setStudentId] = useState(currentStudentId);
  const [skill, setSkill] = useState("TAILOR.L2");
  const [level, setLevel] = useState(2);
  const [evidence, setEvidence] = useState("Practical: stitched a blouse to measurement");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ envelope: Envelope; qr: string } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const [members, setMembers] = useState<CohortMember[]>([]);

  useEffect(() => {
    void roster().then(setStudents);
    void completedSteps("tailor-master").then(setDone);
  }, []);

  const allowed = canFacilitate();

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      try {
        const body = await api<{ cohorts: { cohort_id: string }[] }>("/v1/cohorts");
        const first = body.cohorts?.[0];
        if (first) setMembers(await cohortMembers(first.cohort_id));
      } catch {
        setMembers([]);
      }
    })();
  }, [allowed]);

  const current = pack.value;
  const pathway = current?.pathways["tailor-master"] ?? [];
  const revenue = moduleRevenue();
  const totals = revenue.reduce(
    (sum, row) => ({
      gross: sum.gross + row.gross_inr,
      facilitator: sum.facilitator + row.facilitator_inr,
      platform: sum.platform + row.platform_inr,
    }),
    { gross: 0, facilitator: 0, platform: 0 },
  );

  const issuer = (registry.value?.issuers ?? []).find((row) => row.scope?.some((item) => skill === item || skill.startsWith(item + ".")));

  async function issue() {
    setBusy(true);
    const result = await issueCredential(
      { studentId, skill, level, evidenceLabel: evidence },
      registry.value,
    );
    setBusy(false);
    if (!result.ok || !result.envelope) {
      const reason = result.reason ?? "unknown";
      const text =
        reason === "forbidden_role"
          ? L("इस खाते को सुविधाकर्ता भूमिका नहीं है।", "This account does not hold the facilitator role.")
          : reason === "issuer_lease_expired"
            ? L("जारीकर्ता लीज़ समाप्त — सिंक पर नवीनीकरण करें।", "The issuer lease expired — renew it at sync.")
            : reason === "network_unreachable" || reason === "sign_in_required"
              ? L("जारी करने के लिए सर्वर से जुड़ना ज़रूरी है।", "Issuing needs the hub server; connect and try again.")
              : reason.replace(/_/g, " ");
      notify(text, "bad");
      return;
    }
    const qr = await QRCode.toDataURL(JSON.stringify(result.envelope), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#191833", light: "#ffffff" },
    });
    setIssued({ envelope: result.envelope, qr });
    await refreshLocal();
    setStudents(await roster());
    notify(L(`${skill} प्रमाण लीज़्ड कुंजी से जारी हुआ`, `${skill} credential issued under the leased key`), "good");
  }

  async function finish(step: string) {
    await markAssessmentComplete("tailor-master", step);
    setDone(await completedSteps("tailor-master"));
    await refreshLocal();
  }

  if (!allowed) {
    return (
      <div class="screen">
        <PageHead
          kicker={L("सुविधाकर्ता हब", "Facilitator hub")}
          title={L("यह दृश्य शिक्षकों के लिए है", "This screen is for facilitators")}
          sub={L(
            `प्रमाण जारी करने के लिए FACILITATOR भूमिका चाहिए। आपकी भूमिका: ${currentRole()}।`,
            `Issuing a credential needs the FACILITATOR role. Your role: ${currentRole()}.`,
          )}
        />
        <section class="card">
          <h3>{L("भूमिका कैसे मिले", "How a role is granted")}</h3>
          <p class="muted mt-2">
            {L(
              "प्रशासक सेटिंग्स → भूमिकाएँ से भूमिका देता है। हर बदलाव ऑडिट में दर्ज होता है।",
              "An administrator grants it from Settings → Roles. Every change is written to the audit log.",
            )}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div class="screen">
      <PageHead
        kicker={L("सुविधाकर्ता हब", "Facilitator hub")}
        title={L("एक शिक्षक, पूरी कक्षा", "One teacher, a whole cohort")}
        sub={L(
          "यही ऐप हब मोड में एक लीज़्ड कुंजी से प्रमाण जारी करता है। हर जारीकर्ता कुंजी की सीमा और अवधि होती है।",
          "The same app in hub mode issues credentials under a leased key with a scope and an expiry.",
        )}
        action={<Badge tone="plum">{L("हब प्रोफ़ाइल", "Hub profile")}</Badge>}
      />

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("रोस्टर", "Roster")}</h3>
          <span class="tiny muted">{students.length} {L("छात्र", "students")}</span>
        </div>
        <table class="simple mt-2">
          <thead>
            <tr>
              <th>{L("उपनाम", "Alias")}</th>
              <th>{L("कक्षा", "Class")}</th>
              <th>{L("दस्तावेज़ बाकी", "Missing")}</th>
              <th>{L("प्रमाण", "Creds")}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.studentId}>
                <td>{student.alias}</td>
                <td>{student.className}</td>
                <td>{student.missing.length === 0 ? "—" : student.missing.slice(0, 2).map((doc) => doc.replace(/_/g, " ")).join(", ")}</td>
                <td>{student.credentialCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="tiny muted mt-2">
          {L(
            "नाम की सूची हब पर रहती है; क्लाउड को छद्म आईडी ही जाती है।",
            "The name roster stays on the hub; only pseudonymous IDs reach the cloud.",
          )}
        </p>
        {members.length > 0 && (
          <>
            <h4 class="mt-3">{L("कक्षा सदस्य (सर्वर से)", "Cohort members (from server)")}</h4>
            <table class="simple mt-2">
              <thead>
                <tr>
                  <th>{L("छद्म उपनाम", "Pseudonymous")}</th>
                  <th>{L("प्रमाण", "Creds")}</th>
                  <th>{L("टकराव", "Conflicts")}</th>
                  <th>{L("अंतिम बार", "Last seen")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.student_id}>
                    <td>{member.display_alias || member.student_id.slice(0, 8)}</td>
                    <td>{member.credentials}</td>
                    <td>{member.conflicts}</td>
                    <td>{member.last_seen ? formatDate(member.last_seen) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("मूल्यांकन और जारी करना", "Assessment and issuing")}</h3>
          <Badge tone="info">{wallet.value.length} {L("वॉलेट में", "in wallet")}</Badge>
        </div>
        <div class="stack mt-2">
          <div class="field">
            <label>{L("छात्र", "Student")}</label>
            <select class="select" value={studentId} onChange={(event) => setStudentId((event.target as HTMLSelectElement).value)}>
              <option value={currentStudentId}>
                {students.find((student) => student.studentId === currentStudentId)?.alias ?? L("यह विद्यार्थी", "This learner")}{" "}
                ({L("यह डिवाइस", "this device")})
              </option>
              {members.map((member) => (
                <option key={member.student_id} value={member.student_id}>
                  {member.display_alias || member.student_id.slice(0, 8)}
                </option>
              ))}
              {students
                .filter((student) => student.studentId !== currentStudentId)
                .map((student) => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.alias}
                  </option>
                ))}
            </select>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>{L("कौशल", "Skill")}</label>
              <select
                class="select"
                value={skill}
                onChange={(event) => {
                  const value = (event.target as HTMLSelectElement).value;
                  setSkill(value);
                  setLevel(value.endsWith("L2") ? 2 : 1);
                }}
              >
                {HUB_SKILLS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label>{L("स्तर", "Level")}</label>
              <input class="input" type="number" min={1} max={5} value={level} onInput={(event) => setLevel(Number((event.target as HTMLInputElement).value))} />
            </div>
          </div>
          <div class="field">
            <label>{L("मूल्यांकन का आधार", "Evidence")}</label>
            <input class="input" value={evidence} onInput={(event) => setEvidence((event.target as HTMLInputElement).value)} />
          </div>
          <div class="callout teal">
            {issuer
              ? L(
                  `लीज़: ${issuer.org} · कुंजी ${issuer.kid} epoch ${issuer.epoch} · समाप्ति ${formatDate(issuer.valid_to)}`,
                  `Lease: ${issuer.org} · key ${issuer.kid} epoch ${issuer.epoch} · expires ${formatDate(issuer.valid_to)}`,
                )
              : L(
                  "इस कौशल के लिए कोई अधिकृत जारीकर्ता रजिस्ट्री में नहीं है।",
                  "No authorised issuer in the registry covers this skill.",
                )}
          </div>
          <button class="btn saffron" disabled={busy} onClick={issue}>
            <Icon name="id" size={17} />
            {busy ? L("जारी हो रहा है…", "Issuing…") : L("हस्ताक्षर कर प्रमाण जारी करें", "Sign and issue credential")}
          </button>
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("मूल्यांकन कदम", "Assessment steps")}</h3>
          <span class="tiny muted">{done.size}/{pathway.length}</span>
        </div>
        <div class="stack mt-2">
          {pathway.map((step) => (
            <div class="row-between" key={step.id}>
              <div class="row" style="gap:8px">
                <span class={`leading ${done.has(step.id) ? "good" : ""}`} style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center">
                  {done.has(step.id) ? <Icon name="check" size={14} /> : <Icon name="lock" size={14} />}
                </span>
                <span class="tiny">{pickLocalised(step.title, language)}</span>
              </div>
              {!done.has(step.id) ? (
                <button class="btn secondary small" onClick={() => finish(step.id)}>{L("पूरा", "Done")}</button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section class="card">
        <div class="row-between">
          <h3>{L("मॉड्यूल और हिस्सा", "Modules and revenue share")}</h3>
          <Badge tone="plain">{L("10–15% प्लेटफ़ॉर्म", "10–15% platform")}</Badge>
        </div>
        <table class="simple mt-2">
          <thead>
            <tr>
              <th>{L("मॉड्यूल", "Module")}</th>
              <th>{L("मूल्य", "Price")}</th>
              <th>{L("शिक्षक", "Facilitator")}</th>
            </tr>
          </thead>
          <tbody>
            {revenue.map((row) => (
              <tr key={row.module.id}>
                <td>{row.module.title}</td>
                <td>{row.module.price_inr === 0 ? L("मुफ़्त", "Free") : formatRupees(row.module.price_inr)}</td>
                <td>{formatRupees(row.facilitator_inr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="row-between mt-2 tiny">
          <span class="muted">{L("कुल", "Total")} {formatRupees(totals.gross)}</span>
          <span>{L("शिक्षक को", "to facilitators")} {formatRupees(totals.facilitator)}</span>
        </div>
      </section>

      <Modal open={issued !== null} onClose={() => setIssued(null)} title={L("प्रमाण तैयार", "Credential issued")}>
        {issued ? (
          <>
            <div class="qr-wrap">
              <img src={issued.qr} alt="Credential QR" />
            </div>
            <div class="stack mt-3">
              <div class="row-between"><span class="muted tiny">{L("कौशल", "Skill")}</span><strong>{skill}</strong></div>
              <div class="row-between"><span class="muted tiny">{L("वैधता", "Valid until")}</span><span class="tiny">{formatDate(new Date(Date.now() + 365 * 86_400_000).toISOString())}</span></div>
              <div class="row-between"><span class="muted tiny">{L("कुंजी", "Key")}</span><span class="sig">{issuer ? `${issuer.kid} · epoch ${issuer.epoch}` : "—"}</span></div>
            </div>
            <div class="callout mt-3">
              {L(
                "दूसरे फ़ोन पर Prove → Verify खोलें और यह QR स्कैन करें। सत्यापन बिना नेटवर्क चलेगा।",
                "Open Prove → Verify on a second phone and scan this QR. Verification works with no network.",
              )}
            </div>
            <button class="btn mt-3" onClick={() => setIssued(null)}>{L("बंद करें", "Close")}</button>
          </>
        ) : null}
      </Modal>

      <p class="tiny muted center mt-3">
        {L(
          "हस्ताक्षर हब सर्वर पर होते हैं: निजी कुंजी ब्राउज़र में नहीं आती, सर्वर स्कोप, लीज़ और epoch जाँचता है और रजिस्ट्री में काउंटरसाइन करता है।",
          "Signing happens on the hub server: the private key never reaches the browser, and the server checks scope, lease and epoch before countersigning into the registry.",
        )}
      </p>
    </div>
  );
}
