import { useEffect, useState } from "preact/hooks";
import { api, describeError } from "../data/api";
import { canReview, currentRole } from "../data/roles";
import { notify, lang, pack } from "../state";
import { Badge, PageHead } from "../components/ui";

interface PackRow {
  pack_id: string;
  name: string;
  version: string;
  expires_at: string;
  status: string;
  reviewers: number;
}

interface SignatureRow {
  reviewer_kid: string;
  user_id: string;
  created_at: string;
}

interface ReviewState {
  pack_id: string;
  signatures: SignatureRow[];
  reviewers: number;
  quorum: number;
  golden_pass: boolean;
  publishable: boolean;
  registered: boolean;
}

interface GoldenCase {
  scheme_id: string;
  index: number;
  expected: string;
  actual: string;
  failing_rule: string | null;
  missing: string[];
  pass: boolean;
}

export function Reviewer() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);

  const [packs, setPacks] = useState<PackRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [state, setState] = useState<ReviewState | null>(null);
  const [golden, setGolden] = useState<GoldenCase[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = canReview();

  const activePack = pack.value;
  const fallbackId = activePack ? `${activePack.name}@${activePack.version}` : null;
  const packId = active ?? fallbackId;

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      try {
        const body = await api<{ packs: PackRow[] }>("/v1/admin/rules");
        setPacks(body.packs ?? []);
      } catch (problem) {
        setError(describeError(problem));
      }
    })();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !packId) return;
    void refresh(packId);
  }, [allowed, packId]);

  async function refresh(id: string) {
    setBusy(true);
    setError(null);
    try {
      const [signatures, cases] = await Promise.all([
        api<ReviewState>(`/v1/admin/rules/${encodeURIComponent(id)}/signatures`),
        api<{ pass: boolean; cases: GoldenCase[] }>(`/v1/admin/rules/${encodeURIComponent(id)}/golden`),
      ]);
      setState(signatures);
      setGolden(cases.cases ?? []);
    } catch (problem) {
      setError(describeError(problem));
      setState(null);
      setGolden(null);
    }
    setBusy(false);
  }

  async function coSign() {
    if (!packId) return;
    setBusy(true);
    try {
      const result = await api<{ reviewers: number; status: string; golden_pass: boolean }>(
        `/v1/admin/rules/${encodeURIComponent(packId)}:approve`,
        { method: "POST" },
      );
      notify(
        result.golden_pass && result.reviewers >= 2
          ? L("2 हस्ताक्षर पूरे — पैक प्रकाशन योग्य", "Two signatures — pack is publishable")
          : L(`हस्ताक्षर दर्ज (${result.reviewers}/2)`, `Signature recorded (${result.reviewers}/2)`),
        result.golden_pass ? "good" : "warn",
      );
      await refresh(packId);
    } catch (problem) {
      notify(describeError(problem), "warn");
    }
    setBusy(false);
  }

  if (!allowed) {
    return (
      <div class="screen">
        <PageHead
          kicker={L("नियम समीक्षा", "Rule review")}
          title={L("यह दृश्य समीक्षकों के लिए है", "This screen is for reviewers")}
          sub={L(
            "नियम पैक पर हस्ताक्षर सत्यापित समीक्षक ही करते हैं। आपकी भूमिका: " + currentRole(),
            `Rule packs are co-signed by reviewers. Your role: ${currentRole()}.`,
          )}
        />
        <section class="card">
          <h3>{L("समीक्षक कैसे बनें", "How a reviewer is appointed")}</h3>
          <p class="muted mt-2">
            {L(
              "प्रशासक खाते को REVIEWER भूमिका देता है। हर हस्ताक्षर हैश-चेन ऑडिट में दर्ज होता है।",
              "An administrator grants the REVIEWER role; every signature is written to the hash-chained audit log.",
            )}
          </p>
        </section>
      </div>
    );
  }

  const passCount = golden?.filter((row) => row.pass).length ?? 0;
  const citations = (pack.value?.schemes ?? []).map((scheme) => ({
    id: scheme.id,
    name: scheme.name?.en ?? scheme.name?.hi ?? scheme.id,
    url: scheme.source?.url ?? "",
    verified: scheme.source?.verified ?? "",
    criteria: (scheme.criteria?.all ?? []).map((criterion) => ("id" in criterion ? criterion.id : "")),
    documents: scheme.documents?.length ?? 0,
  }));
  const citedOk = citations.every((row) => row.url && row.verified && row.criteria.length > 0);

  return (
    <div class="screen">
      <PageHead
        kicker={L("नियम समीक्षा", "Rule review")}
        title={L("एआई प्रस्ताव, मनुष्य का निर्णय", "AI proposes, reviewers decide")}
        sub={L(
          "प्रत्येक मानदंड अपने स्रोत के साथ आता है। दो हस्ताक्षर और हरे गोल्डन टेस्ट के बाद ही पैक प्रकाशन योग्य है।",
          "Every criterion carries its source. A pack is publishable only with two signatures and green golden tests.",
        )}
        action={<Badge tone={state?.publishable ? "good" : "plain"}>{state?.publishable ? L("प्रकाशन योग्य", "Publishable") : L("समीक्षा में", "In review")}</Badge>}
      />

      {error && <div class="card mt-2"><p class="muted">{error}</p></div>}

      <section class="card mt-2">
        <div class="row-between">
          <h3>{L("पैक", "Pack")}</h3>
          <Badge tone="plum">{packId ?? "—"}</Badge>
        </div>
        <div class="stack mt-2">
          {packs.length === 0 && <p class="muted">{L("अभी कोई पैक समीक्षा में नहीं है।", "No pack has been registered for review yet.")}</p>}
          {packs.map((row) => (
            <button
              key={row.pack_id}
              class={`list-row ${row.pack_id === packId ? "active" : ""}`}
              onClick={() => setActive(row.pack_id)}
            >
              <span>{row.name} · {row.version}</span>
              <Badge tone={row.status === "PUBLISHABLE" ? "good" : "plain"}>{row.status}</Badge>
            </button>
          ))}
        </div>
        {!state?.registered && packId && (
          <p class="tiny mt-2 muted">
            {L(
              "यह पैक अभी सर्वर पर पंजीकृत नहीं है — पहला हस्ताक्षर इसे दर्ज करेगा।",
              "This pack is not registered yet on the server — the first signature will register it.",
            )}
          </p>
        )}
      </section>

      <section class="card mt-2">
        <div class="row-between">
          <h3>{L("उद्धरण जाँच", "Citation audit")}</h3>
          <Badge tone={citedOk ? "good" : "bad"}>{citedOk ? L("पूरा", "complete") : L("अधूरा", "incomplete")}</Badge>
        </div>
        <p class="tiny muted mt-1">
          {L(
            "हर योजना को स्रोत URL, अंतिम सत्यापन तिथि और नामित मानदंड चाहिए।",
            "Every scheme needs a source URL, a last-verified date and named criteria.",
          )}
        </p>
        <div class="stack mt-2">
          {citations.map((row) => (
            <div class="list-row" key={row.id}>
              <span>
                <strong>{row.name}</strong>
                <span class="tiny muted" style="display:block">{row.url || L("स्रोत नहीं", "no source")} · {row.verified || "—"}</span>
              </span>
              <Badge tone={row.url && row.verified ? "good" : "bad"}>
                {row.criteria.length} {L("मानदंड", "criteria")}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      <section class="card mt-2">
        <div class="row-between">
          <h3>{L("गोल्डन टेस्ट", "Golden tests")}</h3>
          <Badge tone={state?.golden_pass ? "good" : "bad"}>
            {golden ? `${passCount}/${golden.length}` : "—"}
          </Badge>
        </div>
        <div class="table-wrap mt-2">
          <table class="table">
            <thead>
              <tr><th>#</th><th>{L("योजना", "Scheme")}</th><th>{L("अपेक्षित", "Expected")}</th><th>{L("परिणाम", "Actual")}</th><th></th></tr>
            </thead>
            <tbody>
              {(golden ?? []).slice(0, 12).map((row, index) => (
                <tr key={`${row.scheme_id}-${row.index}`}>
                  <td>{index + 1}</td>
                  <td>{row.scheme_id}</td>
                  <td class="mono">{row.expected}</td>
                  <td class="mono">{row.actual}</td>
                  <td><Badge tone={row.pass ? "good" : "bad"}>{row.pass ? "pass" : "fail"}</Badge></td>
                </tr>
              ))}
              {!golden && <tr><td colSpan={5} class="muted">{L("लोड हो रहा है…", "Loading…")}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card mt-2">
        <div class="row-between">
          <h3>{L("सह-हस्ताक्षर", "Co-signatures")}</h3>
          <Badge tone={(state?.reviewers ?? 0) >= 2 ? "good" : "plain"}>
            {state?.reviewers ?? 0} / {state?.quorum ?? 2}
          </Badge>
        </div>
        <p class="tiny muted mt-1">
          {L(
            "एक खाता एक सीट। हस्ताक्षर खाते से बनते हैं, अनुरोध से नहीं।",
            "One account, one seat. Signatures come from the account, never from the request body.",
          )}
        </p>
        <div class="stack mt-2">
          {(state?.signatures ?? []).map((row) => (
            <div class="list-row" key={row.reviewer_kid}>
              <span class="mono">{row.reviewer_kid}</span>
              <span class="tiny muted">{new Date(row.created_at).toLocaleString()}</span>
            </div>
          ))}
          {(state?.signatures ?? []).length === 0 && (
            <p class="muted">{L("अभी कोई हस्ताक्षर नहीं।", "No signature yet.")}</p>
          )}
        </div>
        <button class="btn mt-3" disabled={busy || !packId || !state?.golden_pass} onClick={coSign}>
          {busy ? L("दर्ज हो रहा है…", "Recording…") : L("इस पैक पर हस्ताक्षर करें", "Co-sign this pack")}
        </button>
        {!state?.golden_pass && (
          <p class="tiny mt-2 muted">
            {L(
              "गोल्डन टेस्ट हरे होने तक हस्ताक्षर बंद हैं।",
              "Signing stays disabled until the golden tests are green.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
