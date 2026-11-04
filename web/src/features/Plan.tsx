import { useEffect, useMemo, useState } from "preact/hooks";
import { pickLocalised } from "../i18n";
import { rankCareers } from "../core/scoring";
import { pathwayProgress, pathwayView } from "../core/pathway";
import { completedSteps, markAssessmentComplete } from "../data/hub";
import { refreshLocal, lang, navigate, pack, profile, selectedCareer } from "../state";
import { Badge, Empty, Icon, Meter, PageHead } from "../components/ui";

export function Plan() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const currentPack = pack.value;
  const snapshot = profile.value;
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const ranked = useMemo(() => (currentPack && snapshot ? rankCareers(currentPack.catalogue.careers, snapshot, 6) : []), [currentPack, snapshot]);
  const activeId =
    selectedCareer.value && currentPack?.catalogue.careers.some((career) => career.id === selectedCareer.value)
      ? selectedCareer.value
      : ranked[0]?.career.id ?? "";
  const career = currentPack?.catalogue.careers.find((entry) => entry.id === activeId);
  const steps = currentPack?.pathways[career?.pathway_id ?? ""] ?? [];

  useEffect(() => {
    if (career) void completedSteps(career.pathway_id).then(setDone);
  }, [career?.pathway_id]);

  if (!currentPack || !snapshot || !career) {
    return (
      <div class="screen">
        <PageHead kicker={L("योजना", "Plan")} title={L("पहले प्रोफ़ाइल भरें", "Start with your profile")} />
        <button class="btn" onClick={() => navigate("/profile")}>{L("प्रोफ़ाइल खोलें", "Open profile")}</button>
      </div>
    );
  }

  const view = pathwayView(steps, done);
  const progress = pathwayProgress(steps, done);

  async function complete(stepId: string) {
    setBusyStep(stepId);
    await markAssessmentComplete(career!.pathway_id, stepId);
    setDone(await completedSteps(career!.pathway_id));
    await refreshLocal();
    setBusyStep(null);
  }

  return (
    <div class="screen">
      <PageHead
        kicker={L("मेरा रास्ता", "My pathway")}
        title={pickLocalised(career.title, language)}
        sub={L(
          "कदम तभी पूरा माना जाता है जब घटना दर्ज हो — कोई अनुमान नहीं।",
          "A step is complete only when a recorded event says so. Never because a model guessed.",
        )}
        action={<Badge tone="info">{Math.round(progress * 100)}%</Badge>}
      />

      <div class="scroll-x" style="margin-bottom:12px">
        {ranked.map((entry) => (
          <button
            key={entry.career.id}
            class="chip"
            aria-pressed={entry.career.id === career.id}
            onClick={() => {
              selectedCareer.value = entry.career.id;
              void completedSteps(entry.career.pathway_id).then(setDone);
            }}
          >
            {pickLocalised(entry.career.title, language)}
          </button>
        ))}
      </div>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <span class="card-kicker">{L("प्रगति", "Progress")}</span>
          <span class="tiny muted">{done.size} / {steps.length} {L("कदम", "steps")}</span>
        </div>
        <Meter value={progress} />
        <p class="muted tiny mt-2">
          {L(
            "हर पूरा कदम एक हस्ताक्षरित इवेंट के रूप में इस फ़ोन में और सिंक पर दर्ज होता है।",
            "Each completion is a signed event on this phone and at the server after sync.",
          )}
        </p>
      </section>

      {steps.length === 0 ? (
        <Empty text={L("इस रास्ते के कदम पैक में नहीं हैं।", "This pathway is not in the pack.")} />
      ) : (
        <div class="stack">
          {view.map((entry, index) => (
            <section class="card" key={entry.step.id} style={entry.state === "done" ? "opacity:0.85" : ""}>
              <div class="row-between">
                <div class="row">
                  <span class={`leading ${entry.state === "done" ? "good" : entry.state === "available" ? "saffron" : ""}`} style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center">
                    {entry.state === "done" ? <Icon name="check" size={17} /> : <span style="font-weight:900">{index + 1}</span>}
                  </span>
                  <div>
                    <h3 style="font-size:0.95rem">{pickLocalised(entry.step.title, language)}</h3>
                    <span class="tiny muted">{entry.step.kind}{entry.step.deadline ? ` · ${L("अंतिम तारीख", "deadline")} ${entry.step.deadline}` : ""}</span>
                  </div>
                </div>
                {entry.state === "done" ? (
                  <Badge tone="good">{L("पूरा", "Done")}</Badge>
                ) : entry.state === "locked" ? (
                  <Badge tone="plain"><Icon name="lock" size={12} /> {L("बंद", "Locked")}</Badge>
                ) : (
                  <Badge tone="warn">{L("अभी", "Now")}</Badge>
                )}
              </div>

              {entry.step.documents.length > 0 ? (
                <div class="row wrap mt-2">
                  {entry.step.documents.map((document) => (
                    <Badge tone="plain" key={document}>{document.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              ) : null}

              {entry.state === "available" ? (
                <button class="btn secondary small mt-3" disabled={busyStep === entry.step.id} onClick={() => complete(entry.step.id)}>
                  {busyStep === entry.step.id ? L("दर्ज हो रहा है…", "Recording…") : L("पूरा हुआ दर्ज करें", "Mark complete")}
                </button>
              ) : null}
            </section>
          ))}
        </div>
      )}

      <button class="btn mt-3" onClick={() => navigate(`/career/${career.id}`)}>
        {L("इस करियर की जानकारी", "About this career")}
      </button>
    </div>
  );
}
