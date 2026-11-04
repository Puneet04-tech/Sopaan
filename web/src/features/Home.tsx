import { pickLocalised, t } from "../i18n";
import { evaluateEligibility } from "../core/rules3v";
import { rankCareers } from "../core/scoring";
import { freshness, formatDate } from "../core/format";
import { navigate, online, pack, pendingSync, profile, registry, tokens, wallet, lang, outbox } from "../state";
import { Icon, FreshnessChip, Stairway, Badge } from "../components/ui";

export function Home() {
  const currentPack = pack.value;
  const snapshot = profile.value;
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);

  if (!currentPack || !snapshot) return null;

  const values = snapshot.values;
  const ranked = rankCareers(currentPack.catalogue.careers, snapshot, 3);
  const top = ranked[0];
  const outcomes = currentPack.schemes.map((scheme) => ({
    scheme,
    result: evaluateEligibility(scheme.criteria, values, snapshot.confidence, scheme.documents),
  }));
  const eligible = outcomes.filter((entry) => entry.result.outcome === "ELIGIBLE");
  const needInfo = outcomes.filter((entry) => entry.result.outcome === "NEED_INFO");
  const doneSteps = [
    Boolean(currentPack),
    Object.keys(snapshot.values).length > 4,
    outcomes.length > 0,
    wallet.value.length > 0,
    tokens.value.some((token) => token.status === "REDEEMED" || token.status === "SETTLED"),
  ].filter(Boolean).length;

  const packState = freshness({ expiresAt: currentPack.expires_at, pendingSync: pendingSync.value });
  const name = String(values.student_name ?? L("विद्यार्थी", "Student"));

  return (
    <div class="screen">
      <header class="page-head">
        <div class="row-between">
          <div class="row">
            <div class="avatar">{name.slice(0, 1)}</div>
            <div>
              <div class="eyebrow">{L("हर कदम, प्रमाणित", "Every step, signed")}</div>
              <h1>{L("नमस्ते, ", "Hello, ")}{name}</h1>
              <p class="muted">
                {L("कक्षा ", "Class ")}
                {String(values.class_level ?? "—")}
                {values.district ? ` · ${String(values.district)}` : ""}
              </p>
            </div>
          </div>
          <button class="icon-btn" onClick={() => navigate("/profile")} aria-label={L("प्रोफ़ाइल", "Profile")}>
            <Icon name="mic" size={18} />
          </button>
        </div>
      </header>

      <section class="card dark" style="margin-bottom:14px">
        <div class="row-between" style="align-items:flex-start">
          <div style="max-width:70%">
            <div class="card-kicker" style="color:rgba(247,243,234,0.6)">
              {L("पाँच कड़ियों की श्रृंखला", "The five-link chain")}
            </div>
            <h2 style="margin-top:4px;color:#fff8ea">
              {L("हर कदम पर हस्ताक्षर", "Proof at every step")}
            </h2>
            <p class="tiny" style="margin-top:6px">
              {L(
                "नियम → पात्रता → अगला कदम → कौशल प्रमाण → क्रेडिट",
                "Rules → eligibility → next step → skill proof → credit",
              )}
            </p>
          </div>
          <div style="width:120px">
            <Stairway filled={doneSteps} />
          </div>
        </div>
        <div class="metric-grid" style="margin-top:14px">
          <div class="metric" style="background:rgba(255,255,255,0.08)">
            <div class="value" style="color:#fff8ea">{eligible.length}</div>
            <div class="label" style="color:rgba(247,243,234,0.6)">{L("पात्र", "Eligible")}</div>
          </div>
          <div class="metric" style="background:rgba(255,255,255,0.08)">
            <div class="value" style="color:#fff8ea">{needInfo.length}</div>
            <div class="label" style="color:rgba(247,243,234,0.6)">{L("जानकारी बाकी", "Need info")}</div>
          </div>
          <div class="metric" style="background:rgba(255,255,255,0.08)">
            <div class="value" style="color:#fff8ea">{wallet.value.length}</div>
            <div class="label" style="color:rgba(247,243,234,0.6)">{L("प्रमाण", "Credentials")}</div>
          </div>
        </div>
      </section>

      {top ? (
        <button class="card buttonlike" onClick={() => navigate(`/career/${top.career.id}`)} style="margin-bottom:14px">
          <div class="row-between">
            <span class="badge plum">{pickLocalised(currentPack.catalogue.clusters.find((c) => c.id === top.career.cluster), language)}</span>
            <span class="tiny muted">{L("सुझाव", "Suggested")}</span>
          </div>
          <h2 style="margin-top:10px">{pickLocalised(top.career.title, language)}</h2>
          <p class="muted" style="margin-top:4px">{pickLocalised(top.career.summary, language)}</p>
          <div class="row wrap" style="margin-top:10px">
            <Badge tone="good">{Math.round(top.parts.score * 100)}% {L("मेल", "fit")}</Badge>
            <Badge tone="plain">{top.career.wage_band}</Badge>
            <Badge tone="info">{top.career.distance_km === 0 ? L("घर से", "At home") : `${top.career.distance_km} km`}</Badge>
          </div>
          <div class="row" style="margin-top:12px;color:var(--plum);font-weight:800;font-size:0.85rem">
            {t("common.next", language)}
            <Icon name="arrow" size={16} />
          </div>
        </button>
      ) : null}

      <div class="two-col">
        <section class="card">
          <div class="card-title">
            <h3>{L("सत्यापित पात्रता", "Verified eligibility")}</h3>
            <FreshnessChip />
          </div>
          <p class="muted mt-2">
            {L(
              `${eligible.length} योजनाओं के लिए आप पात्र हैं। हर नतीजा नियम, संस्करण और स्रोत दिखाता है।`,
              `You are eligible for ${eligible.length} schemes. Every result cites its rule, version and source.`,
            )}
          </p>
          <button class="btn secondary small mt-3" onClick={() => navigate("/act")}>
            {L("सभी योजनाएँ देखें", "See all schemes")}
          </button>
        </section>

        <section class="card">
          <div class="card-title">
            <h3>{L("सिंक स्थिति", "Sync status")}</h3>
            <Badge tone={online.value ? "good" : "warn"}>{online.value ? t("common.online", language) : t("common.offline", language)}</Badge>
          </div>
          <p class="muted mt-2">
            {outbox.value?.queued
              ? L(`${outbox.value.queued} इवेंट सिंक बाकी हैं।`, `${outbox.value.queued} events pending sync.`)
              : L("सब कुछ इस फ़ोन पर सुरक्षित है।", "Everything is saved on this phone.")}
          </p>
          <button class="btn secondary small mt-3" onClick={() => navigate("/sync")}>
            {t("common.sync", language)}
          </button>
        </section>
      </div>

      <section class="card tint" style="margin-top:14px">
        <div class="row-between">
          <div class="row">
            <span class="leading" style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--plum-soft);color:var(--plum)">
              <Icon name="spark" size={18} />
            </span>
            <div>
              <h3>{L("राधा की कहानी — 8 कदम", "Radha's story — 8 steps")}</h3>
              <p class="muted tiny">{L("पूरा डेमो, बिना नेटवर्क", "The full demo, with no network")}</p>
            </div>
          </div>
          <button class="btn saffron small" onClick={() => navigate("/tour")}>
            {L("शुरू करें", "Start")}
          </button>
        </div>
      </section>

      <div class="row wrap" style="margin:14px 2px 0; gap:6px">
        <Badge tone="plain">pack {currentPack.version}</Badge>
        <Badge tone={packState.state === "stale" ? "warn" : "info"}>
          {packState.state === "stale" ? L("पुराना पैक", "Stale pack") : L("पैक ताज़ा", "Pack fresh")}
        </Badge>
        {registry.value ? (
          <Badge tone="plain">
            {L("रजिस्ट्री", "Registry")} {formatDate(registry.value.synced_at)}
          </Badge>
        ) : null}
        <Badge tone="plum">{L("क्रेडिट सिम्युलेटेड", "Credits simulated")}</Badge>
      </div>
    </div>
  );
}
