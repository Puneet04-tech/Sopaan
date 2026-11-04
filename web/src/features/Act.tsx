import { useState } from "preact/hooks";
import { pickLocalised } from "../i18n";
import { evaluateEligibility, describeMissing, type EligibilityResult } from "../core/rules3v";
import { freshness, formatDate } from "../core/format";
import { lang, navigate, pack, pendingSync, profile, registry } from "../state";
import { Badge, FreshnessChip, Icon, PageHead } from "../components/ui";

type Filter = "all" | "ELIGIBLE" | "NEED_INFO" | "NOT_ELIGIBLE";

export function Act() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const currentPack = pack.value;
  const snapshot = profile.value;
  const [filter, setFilter] = useState<Filter>("all");

  if (!currentPack || !snapshot) return null;

  const rows = currentPack.schemes.map((scheme) => ({
    scheme,
    result: evaluateEligibility(scheme.criteria, snapshot.values, snapshot.confidence, scheme.documents) as EligibilityResult,
  }));
  const order: Record<string, number> = { ELIGIBLE: 0, NEED_INFO: 1, NOT_ELIGIBLE: 2 };
  const sorted = [...rows].sort((a, b) => order[a.result.outcome] - order[b.result.outcome]);
  const shown = sorted.filter((entry) => filter === "all" || entry.result.outcome === filter);
  const counts = {
    ELIGIBLE: rows.filter((entry) => entry.result.outcome === "ELIGIBLE").length,
    NEED_INFO: rows.filter((entry) => entry.result.outcome === "NEED_INFO").length,
    NOT_ELIGIBLE: rows.filter((entry) => entry.result.outcome === "NOT_ELIGIBLE").length,
  };
  const packState = freshness({ expiresAt: currentPack.expires_at, pendingSync: pendingSync.value });

  return (
    <div class="screen">
      <PageHead
        kicker={L("पात्रता", "Eligibility")}
        title={L("कौन सी योजना आपके लिए", "Which schemes fit you")}
        sub={L(
          "हर नतीजा नियम, पैक संस्करण, स्रोत और तारीख बताता है। कोई चैटबॉट अनुमान नहीं।",
          "Every result cites the rule, pack version, source and date. No chatbot guesswork.",
        )}
        action={<FreshnessChip />}
      />

      <div class="metric-grid" style="margin-bottom:12px">
        <div class="metric">
          <div class="value" style="color:var(--good)">{counts.ELIGIBLE}</div>
          <div class="label">{L("पात्र", "Eligible")}</div>
        </div>
        <div class="metric">
          <div class="value" style="color:#8a5a00">{counts.NEED_INFO}</div>
          <div class="label">{L("जानकारी बाकी", "Need info")}</div>
        </div>
        <div class="metric">
          <div class="value" style="color:var(--danger)">{counts.NOT_ELIGIBLE}</div>
          <div class="label">{L("पात्र नहीं", "Not eligible")}</div>
        </div>
      </div>

      {packState.state === "stale" ? (
        <div class="callout" style="margin-bottom:12px">
          <strong>{L("पैक पुराना है", "This pack is stale")}</strong> — {packState.detail}.{" "}
          {L("नतीजे दिखाए जाते हैं, पर पुराने माने जाते हैं।", "Results are shown but labelled as past their expiry.")}
        </div>
      ) : null}

      <div class="segmented" style="margin-bottom:12px">
        {([
          ["all", L("सभी", "All")],
          ["ELIGIBLE", L("पात्र", "Eligible")],
          ["NEED_INFO", L("बाकी", "Need info")],
          ["NOT_ELIGIBLE", L("नहीं", "Not eligible")],
        ] as [Filter, string][]).map(([id, label]) => (
          <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      <div class="stack">
        {shown.map((entry) => {
          const tone = entry.result.outcome === "ELIGIBLE" ? "good" : entry.result.outcome === "NEED_INFO" ? "warn" : "bad";
          return (
            <button class="card buttonlike" key={entry.scheme.id} onClick={() => navigate(`/act/${entry.scheme.id}`)}>
              <div class="row-between">
                <Badge tone={tone as "good" | "warn" | "bad"}>
                  <Icon name={entry.result.outcome === "ELIGIBLE" ? "check" : entry.result.outcome === "NEED_INFO" ? "warn" : "x"} size={12} />
                  {entry.result.outcome === "ELIGIBLE"
                    ? L("पात्र", "Eligible")
                    : entry.result.outcome === "NEED_INFO"
                      ? L("जानकारी बाकी", "Need info")
                      : L("पात्र नहीं", "Not eligible")}
                </Badge>
                <span class="tiny muted">{formatDate(entry.scheme.deadline)}</span>
              </div>
              <h3 style="margin-top:8px;font-size:1rem">{pickLocalised(entry.scheme.name, language)}</h3>
              <p class="tiny muted mt-2">
                {entry.result.outcome === "NOT_ELIGIBLE"
                  ? `${L("नियम", "Rule")} ${entry.result.rule} ${L("लागू नहीं होता", "is not satisfied")}`
                  : entry.result.outcome === "NEED_INFO"
                    ? `${L("चाहिए", "Needed")}: ${entry.result.missing.slice(0, 3).map(describeMissing).join(", ")}`
                    : `${L("दस्तावेज़", "Documents")}: ${entry.scheme.documents.length}`}
              </p>
              <div class="row-between mt-2">
                <span class="tiny muted">pack {currentPack.version} · {entry.scheme.source.verified}</span>
                <Icon name="chevron" size={16} />
              </div>
            </button>
          );
        })}
      </div>

      <p class="tiny muted center" style="margin-top:14px">
        {L(
          `रजिस्ट्री ${registry.value ? formatDate(registry.value.synced_at) : "—"} तक · हर फ़ैसला डिवाइस पर`,
          `Registry as of ${registry.value ? formatDate(registry.value.synced_at) : "—"} · every decision runs on the device`,
        )}
      </p>
    </div>
  );
}
