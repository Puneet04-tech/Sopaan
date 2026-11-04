import { useEffect, useState } from "preact/hooks";
import { evaluateEligibility, expectationMatches } from "../core/rules3v";
import { SAMPLE_PROPOSAL, REVIEWERS, citationChecks, type Proposal } from "../data/review";
import { getSetting, setSetting } from "../data/db";
import { notify, lang, pack } from "../state";
import { Badge, Icon, PageHead } from "../components/ui";

export function Reviewer() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [proposal] = useState<Proposal>(SAMPLE_PROPOSAL);
  const [signatures, setSignatures] = useState<string[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSetting<string[]>("proposal_signatures", []).then(setSignatures);
  }, []);

  const checks = citationChecks(proposal);
  const golden = proposal.golden.map((test) => {
    const result = evaluateEligibility(proposal.criteria, test.profile, {}, proposal.documents);
    return { ...test, actual: result, pass: expectationMatches(test.expect, result) };
  });
  const goldenPass = golden.every((test) => test.pass);
  const citationsPass = checks.every((check) => check.ok);
  const quorum = signatures.length >= 2;
  const publishable = goldenPass && citationsPass && quorum;

  async function toggleSign(reviewerId: string) {
    if (!goldenPass) {
      notify(L("पहले गोल्डन टेस्ट पास करें", "Golden tests must pass before co-signing"), "warn");
      return;
    }
    const next = signatures.includes(reviewerId)
      ? signatures.filter((id) => id !== reviewerId)
      : [...signatures, reviewerId];
    setSignatures(next);
    await setSetting("proposal_signatures", next);
    if (next.length === 2) notify(L("2/3 हस्ताक्षर पूरे — प्रकाशन योग्य", "2 of 3 signatures — publishable"), "good");
  }

  async function tryLive() {
    setBusy(true);
    try {
      const response = await fetch("http://localhost:8000/v1/rules:extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: proposal.source.text, scheme_id: proposal.scheme_id }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as unknown;
      setLive(JSON.stringify(body, null, 2));
      notify(L("लाइव एक्सट्रैक्टर से जवाब मिला", "Live extractor responded"), "good");
    } catch (error) {
      setLive(`offline: ${String(error)}`);
      notify(L("AI सेवा उपलब्ध नहीं — स्थानीय प्रस्ताव दिख रहा है", "AI service unavailable — showing the bundled proposal"), "warn");
    }
    setBusy(false);
  }

  return (
    <div class="screen">
      <PageHead
        kicker={L("नियम समीक्षा", "Rule review")}
        title={L("AI प्रस्ताव देता है, नियम तय करते हैं", "AI proposes, rules decide")}
        sub={L(
          "हर मानदंड स्रोत से शब्दशः उद्धृत होना चाहिए। दो समीक्षकों के हस्ताक्षर और हरे गोल्डन टेस्ट के बाद ही पैक बन सकता है।",
          "Every criterion must quote the source verbatim. Only two reviewer signatures plus green golden tests make a pack publishable.",
        )}
        action={<Badge tone={publishable ? "good" : "warn"}>{publishable ? L("प्रकाशन योग्य", "Publishable") : L("प्रस्तावित", "PROPOSED")}</Badge>}
      />

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <span class="card-kicker">{proposal.id}</span>
          <Badge tone="plain">{L("डेमो नमूना", "Bundled sample")}</Badge>
        </div>
        <h2 style="margin-top:6px;font-size:1.1rem">{L(proposal.title.hi, proposal.title.en)}</h2>
        <p class="tiny muted mt-2">
          {proposal.source.url} · verified {proposal.source.verified} · {L("अंतिम तारीख", "deadline")} {proposal.deadline}
        </p>
        <div class="row wrap mt-2">
          {proposal.documents.map((document) => (
            <Badge tone="plain" key={document}>{document.replace(/_/g, " ")}</Badge>
          ))}
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("स्रोत उद्धरण", "Source citations")}</h3>
          <Badge tone={citationsPass ? "good" : "bad"}>
            {checks.filter((check) => check.ok).length}/{checks.length} {L("मिले", "verbatim")}
          </Badge>
        </div>
        <div class="stack mt-2">
          {proposal.citations.map((citation) => {
            const check = checks.find((entry) => entry.criterion_id === citation.criterion_id);
            return (
              <div class="list-item" key={citation.criterion_id}>
                <span class={`leading ${check?.ok ? "good" : "bad"}`}>
                  <Icon name={check?.ok ? "check" : "x"} size={15} />
                </span>
                <div class="grow">
                  <div class="row-between">
                    <strong class="tiny">{citation.criterion_id}</strong>
                    <span class="tiny muted">{check?.ok ? "verbatim" : "not found"}</span>
                  </div>
                  <div class="tiny muted" style="margin-top:2px">“{citation.quote}”</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("गोल्डन टेस्ट", "Golden tests")}</h3>
          <Badge tone={goldenPass ? "good" : "bad"}>
            {golden.filter((test) => test.pass).length}/{golden.length}
          </Badge>
        </div>
        <table class="simple mt-2">
          <thead>
            <tr><th>{L("अपेक्षा", "Expect")}</th><th>{L("नतीजा", "Actual")}</th><th /></tr>
          </thead>
          <tbody>
            {golden.map((test, index) => (
              <tr key={index}>
                <td>{test.expect}</td>
                <td>{test.actual.outcome}{test.actual.rule ? `:${test.actual.rule}` : ""}{test.actual.missing.length ? `:${test.actual.missing.join(",")}` : ""}</td>
                <td>{test.pass ? <Badge tone="good">pass</Badge> : <Badge tone="bad">fail</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("2-का-3 हस्ताक्षर", "2-of-3 co-sign")}</h3>
          <span class="tiny muted">{signatures.length}/3</span>
        </div>
        <div class="stack mt-2">
          {REVIEWERS.map((reviewer, index) => {
            const signed = signatures.includes(reviewer.id);
            return (
              <div class="row-between" key={reviewer.id}>
                <div class="gate">
                  <span class={`seal ${signed ? "signed" : ""}`}>{signed ? <Icon name="check" size={14} /> : index + 1}</span>
                  <div>
                    <div class="tiny" style="font-weight:700">{reviewer.name}</div>
                    <div class="tiny muted">{reviewer.kid}</div>
                  </div>
                </div>
                <button class={`btn small ${signed ? "secondary" : ""}`} onClick={() => toggleSign(reviewer.id)}>
                  {signed ? L("हटाएँ", "Remove") : L("हस्ताक्षर", "Sign")}
                </button>
              </div>
            );
          })}
        </div>
        <div class={`callout ${publishable ? "teal" : ""} mt-3`}>
          {publishable
            ? L(
                "प्रकाशन योग्य। CI ऑफ़लाइन पैक कुंजी से हस्ताक्षर करता है; यह स्क्रीन कभी निजी कुंजी नहीं रखती।",
                "Publishable. CI signs with the offline pack key; this screen never holds a private signing key.",
              )
            : L(
                "प्रकाशन तब तक नहीं जब तक गोल्डन टेस्ट हरे न हों और दो समीक्षक हस्ताक्षर न करें।",
                "Nothing publishes until golden tests are green and two reviewers have signed.",
              )}
        </div>
      </section>

      <section class="card">
        <div class="row-between">
          <h3>{L("लाइव AI एक्सट्रैक्टर", "Live AI extractor")}</h3>
          <button class="btn secondary small" disabled={busy} onClick={tryLive}>
            {busy ? "…" : L("आज़माएँ", "Try it")}
          </button>
        </div>
        <p class="muted tiny mt-2">
          {L(
            "FastAPI सेवा (localhost:8000) चालू हो तो प्रस्ताव लाइव आता है; न हो तो यही नमूना दिखता है। आउटपुट हमेशा PROPOSED रहता है।",
            "If the FastAPI service is running on localhost:8000 the proposal is extracted live; otherwise this sample is used. Output is always PROPOSED.",
          )}
        </p>
        {live ? <pre class="code mt-2" style="max-height:220px">{live}</pre> : null}
        <p class="tiny muted mt-2">
          {L(
            `सक्रिय पैक ${pack.value?.version ?? "—"} · प्रस्ताव पैक से अलग है`,
            `Active pack ${pack.value?.version ?? "—"} · the proposal is not part of the pack`,
          )}
        </p>
      </section>
    </div>
  );
}
