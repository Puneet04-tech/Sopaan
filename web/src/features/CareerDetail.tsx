import { useEffect, useState } from "preact/hooks";
import { pickLocalised } from "../i18n";
import { scoreCareer } from "../core/scoring";
import { evaluateEligibility } from "../core/rules3v";
import { pathwayProgress, pathwayView } from "../core/pathway";
import { formatRupees } from "../core/format";
import { completedSteps } from "../data/hub";
import { lang, navigate, pack, profile, selectedCareer } from "../state";
import { Badge, Icon, Meter, PageHead } from "../components/ui";

export function CareerDetail({ careerId }: { careerId: string }) {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const currentPack = pack.value;
  const snapshot = profile.value;
  const [done, setDone] = useState<Set<string>>(new Set());

  const career = currentPack?.catalogue.careers.find((entry) => entry.id === careerId);
  const steps = currentPack?.pathways[career?.pathway_id ?? ""] ?? [];

  useEffect(() => {
    selectedCareer.value = careerId;
    void completedSteps(career?.pathway_id ?? "").then(setDone);
  }, [careerId, career?.pathway_id]);

  if (!currentPack || !snapshot || !career) {
    return (
      <div class="screen">
        <PageHead kicker={L("नहीं मिला", "Not found")} title={L("यह विकल्प उपलब्ध नहीं", "That option is not in the pack")} />
        <button class="btn secondary" onClick={() => navigate("/discover")}>{L("वापस", "Back")}</button>
      </div>
    );
  }

  const parts = scoreCareer(career, snapshot);
  const pathway = pathwayView(steps, done);
  const progress = pathwayProgress(steps, done);
  const schemes = currentPack.schemes
    .filter((scheme) => career.scheme_ids.includes(scheme.id))
    .map((scheme) => ({
      scheme,
      result: evaluateEligibility(scheme.criteria, snapshot.values, snapshot.confidence, scheme.documents),
    }));
  const eligible = schemes.filter((entry) => entry.result.outcome === "ELIGIBLE");
  const cluster = currentPack.catalogue.clusters.find((entry) => entry.id === career.cluster);

  return (
    <div class="screen">
      <button class="link-btn" style="margin-bottom:8px" onClick={() => navigate("/discover")}>
        ← {L("सभी विकल्प", "All options")}
      </button>
      <PageHead
        kicker={cluster ? pickLocalised(cluster, language) : ""}
        title={pickLocalised(career.title, language)}
        sub={pickLocalised(career.summary, language)}
        action={<Badge tone="good">{Math.round(parts.score * 100)}%</Badge>}
      />

      <section class="card" style="margin-bottom:12px">
        <div class="metric-grid">
          <div class="metric">
            <div class="value">{career.cost_inr === 0 ? L("मुफ़्त", "Free") : formatRupees(career.cost_inr)}</div>
            <div class="label">{L("लागत", "Cost")}</div>
          </div>
          <div class="metric">
            <div class="value">{career.distance_km === 0 ? "0" : career.distance_km} km</div>
            <div class="label">{L("दूरी", "Distance")}</div>
          </div>
          <div class="metric">
            <div class="value">{career.duration_months}</div>
            <div class="label">{L("महीने", "Months")}</div>
          </div>
        </div>
        <p class="muted tiny mt-2">{career.wage_band}</p>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("मेल का हिसाब", "Fit breakdown")}</h3>
          <span class="tiny muted">{L("पारदर्शी अंक", "Transparent score")}</span>
        </div>
        <div class="stack mt-2">
          {[
            ["interest_match", L("रुचि", "Interest"), 0.3],
            ["skill_overlap", L("कौशल", "Skills"), 0.25],
            ["cost_fit", L("लागत", "Cost"), 0.15],
            ["distance_fit", L("दूरी", "Distance"), 0.15],
            ["prereq_closeness", L("पूर्व-शर्त", "Prerequisites"), 0.1],
          ].map(([key, label, weight]) => {
            const value = Number(parts[key as keyof typeof parts]);
            return (
              <div key={String(key)}>
                <div class="row-between tiny" style="margin-bottom:3px">
                  <span>{label} <span class="muted">× {Number(weight)}</span></span>
                  <span>{Math.round(value * 100)}%</span>
                </div>
                <div class="meter"><span style={`width:${Math.max(2, value * 100)}%`} /></div>
              </div>
            );
          })}
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("मेरा रास्ता", "My pathway")}</h3>
          <Badge tone="info">{Math.round(progress * 100)}%</Badge>
        </div>
        <Meter value={progress} />
        <div class="stack mt-3">
          {pathway.map((view) => (
            <div class="list-item" key={view.step.id}>
              <span class={`leading ${view.state === "done" ? "good" : view.state === "available" ? "saffron" : ""}`}>
                {view.state === "done" ? <Icon name="check" size={16} /> : <Icon name={view.state === "locked" ? "lock" : "arrow"} size={16} />}
              </span>
              <div class="grow">
                <div style="font-weight:700;font-size:0.85rem">{pickLocalised(view.step.title, language)}</div>
                <div class="tiny muted">
                  {view.state === "locked"
                    ? `${L("पहले पूरा करें", "First complete")}: ${view.blockedBy.join(", ")}`
                    : view.step.kind}
                  {view.step.deadline ? ` · ${view.step.deadline}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button class="btn secondary mt-3" onClick={() => navigate("/plan")}>
          {L("योजना खोलें", "Open the plan")}
        </button>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("इस रास्ते के लिए योजनाएँ", "Schemes for this path")}</h3>
          <Badge tone="plain">{eligible.length}/{schemes.length}</Badge>
        </div>
        <div class="stack mt-2">
          {schemes.map((entry) => (
            <button
              key={entry.scheme.id}
              class="list-item"
              style="text-align:left;font-family:inherit;color:inherit;width:100%;cursor:pointer"
              onClick={() => navigate(`/act/${entry.scheme.id}`)}
            >
              <span class={`leading ${entry.result.outcome === "ELIGIBLE" ? "good" : entry.result.outcome === "NEED_INFO" ? "saffron" : "bad"}`}>
                <Icon name={entry.result.outcome === "ELIGIBLE" ? "check" : entry.result.outcome === "NEED_INFO" ? "warn" : "x"} size={16} />
              </span>
              <span class="grow">
                <span style="display:block;font-weight:700;font-size:0.85rem">{pickLocalised(entry.scheme.name, language)}</span>
                <span class="tiny muted">
                  {entry.result.outcome === "ELIGIBLE"
                    ? L("पात्र", "Eligible")
                    : entry.result.outcome === "NEED_INFO"
                      ? `${L("जानकारी बाकी", "Need info")}: ${entry.result.missing.length}`
                      : `${L("नियम", "Rule")} ${entry.result.rule}`}
                </span>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
