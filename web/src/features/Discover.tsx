import { useMemo, useState } from "preact/hooks";
import { pickLocalised } from "../i18n";
import { rankCareers } from "../core/scoring";
import { lang, navigate, pack, profile } from "../state";
import { Badge, Empty, Icon, PageHead } from "../components/ui";

export function Discover() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const currentPack = pack.value;
  const snapshot = profile.value;
  const [cluster, setCluster] = useState<string>("all");

  const ranked = useMemo(() => {
    if (!currentPack || !snapshot) return [];
    return rankCareers(currentPack.catalogue.careers, snapshot, 14);
  }, [currentPack, snapshot]);

  if (!currentPack || !snapshot) return null;

  const clusters = currentPack.catalogue.clusters;
  const shown = ranked.filter((entry) => cluster === "all" || entry.career.cluster === cluster);
  const clustersShown = new Set(ranked.slice(0, 6).map((entry) => entry.career.cluster)).size;

  return (
    <div class="screen">
      <PageHead
        kicker={L("करियर खोज", "Career discovery")}
        title={L("रास्ते जो आपके पास हैं", "Paths that are actually open")}
        sub={L(
          "यह सूची आपकी रुचि, कौशल, लागत, दूरी और पूर्व-शर्तों से बनी है — कोई AI अनुमान नहीं।",
          "Ranked from your interests, skills, cost, distance and prerequisites — not an AI guess.",
        )}
        action={<Badge tone="plum">{ranked.length}</Badge>}
      />

      <div class="callout teal" style="margin-bottom:12px">
        <strong>{clustersShown} {L("समूह", "clusters")}</strong> ·{" "}
        {L(
          "व्यावसायिक और गैर-विज्ञान विकल्प जानबूझकर शीर्ष पर रखे जाते हैं।",
          "Vocational and non-STEM options are deliberately kept in the top six.",
        )}
      </div>

      <div class="scroll-x" style="margin-bottom:14px">
        <button class="chip" aria-pressed={cluster === "all"} onClick={() => setCluster("all")}>
          {L("सभी", "All")}
        </button>
        {clusters.map((entry) => (
          <button key={entry.id} class="chip" aria-pressed={cluster === entry.id} onClick={() => setCluster(entry.id)}>
            {pickLocalised(entry, language)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty text={L("इस समूह में कुछ नहीं मिला।", "Nothing in this cluster.")} />
      ) : (
        <div class="stack">
          {shown.map((entry, index) => (
            <button
              class="card buttonlike"
              key={entry.career.id}
              onClick={() => navigate(`/career/${entry.career.id}`)}
            >
              <div class="row-between">
                <span class="card-kicker">
                  {pickLocalised(clusters.find((item) => item.id === entry.career.cluster), language)}
                </span>
                <span class="tiny muted">#{index + 1}</span>
              </div>
              <h3 style="margin-top:6px;font-size:1.05rem">{pickLocalised(entry.career.title, language)}</h3>
              <p class="muted tiny" style="margin-top:4px">{pickLocalised(entry.career.summary, language)}</p>
              <div class="row wrap mt-2">
                <Badge tone={index < 3 ? "good" : "plain"}>{Math.round(entry.parts.score * 100)}% {L("मेल", "fit")}</Badge>
                <Badge tone="plain">{entry.career.cost_inr === 0 ? L("मुफ़्त", "No fee") : `₹${entry.career.cost_inr.toLocaleString("en-IN")}`}</Badge>
                <Badge tone="plain">{entry.career.distance_km === 0 ? L("घर से", "At home") : `${entry.career.distance_km} km`}</Badge>
                <Badge tone="info">{entry.career.duration_months} {L("महीने", "months")}</Badge>
              </div>
              <div class="row-between mt-2">
                <span class="tiny muted">{entry.career.wage_band}</span>
                <span style="color:var(--plum)"><Icon name="chevron" size={16} /></span>
              </div>
            </button>
          ))}
        </div>
      )}

      <section class="card tint" style="margin-top:16px">
        <h3>{L("यह क्रम कैसे बना?", "How is this ranked?")}</h3>
        <p class="muted tiny mt-2">
          {L(
            "0.30 रुचि + 0.25 कौशल + 0.15 लागत + 0.15 दूरी + 0.10 पूर्व-शर्त − 0.05 अंतर। फिर विविधता के लिए MMR।",
            "0.30 interest + 0.25 skill + 0.15 cost + 0.15 distance + 0.10 prerequisites − 0.05 gap, then diversity re-ranking.",
          )}
        </p>
        <p class="tiny muted mt-2">pack {currentPack.version} · {currentPack.catalogue.careers.length} {L("विकल्प", "options")}</p>
      </section>
    </div>
  );
}
