import { useState } from "preact/hooks";
import { pickLocalised } from "../i18n";
import { describeMissing, evaluateEligibility } from "../core/rules3v";
import { freshness } from "../core/format";
import { lang, navigate, pack, pendingSync, profile } from "../state";
import { Badge, FreshBadge, Icon, PageHead, SourceCite } from "../components/ui";
import { speak, ttsAvailable } from "../voice/tts";

export function ActDetail({ schemeId }: { schemeId: string }) {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const currentPack = pack.value;
  const snapshot = profile.value;
  const [speaking, setSpeaking] = useState(false);

  const scheme = currentPack?.schemes.find((entry) => entry.id === schemeId);
  if (!currentPack || !snapshot || !scheme) {
    return (
      <div class="screen">
        <PageHead kicker={L("नहीं मिला", "Not found")} title={L("यह योजना पैक में नहीं है", "That scheme is not in the pack")} />
        <button class="btn secondary" onClick={() => navigate("/act")}>{L("वापस", "Back")}</button>
      </div>
    );
  }

  const result = evaluateEligibility(scheme.criteria, snapshot.values, snapshot.confidence, scheme.documents);
  const packState = freshness({ expiresAt: currentPack.expires_at, pendingSync: pendingSync.value });
  const tone = result.outcome === "ELIGIBLE" ? "good" : result.outcome === "NEED_INFO" ? "warn" : "bad";
  const headline =
    result.outcome === "ELIGIBLE"
      ? L("आप पात्र हैं", "You are eligible")
      : result.outcome === "NEED_INFO"
        ? L("कुछ जानकारी बाकी है", "A few facts are missing")
        : L("यह नियम पूरा नहीं होता", "One rule is not met");

  const familyText = language === "en" ? scheme.family_voice.en : scheme.family_voice.hi;

  function playFamilyVoice(): void {
    setSpeaking(true);
    const ok = speak(familyText, language);
    if (!ok) setSpeaking(false);
    window.setTimeout(() => setSpeaking(false), 9000);
  }

  return (
    <div class="screen">
      <button class="link-btn" style="margin-bottom:8px" onClick={() => navigate("/act")}>
        ← {L("सभी योजनाएँ", "All schemes")}
      </button>

      <PageHead
        kicker={`${L("योजना", "Scheme")} · ${scheme.level}`}
        title={pickLocalised(scheme.name, language)}
        action={<FreshBadge value={packState} />}
      />

      <section class={`card ${tone === "good" ? "" : ""}`} style="margin-bottom:12px;border-color:var(--line-strong)">
        <div class="row-between">
          <Badge tone={tone as "good" | "warn" | "bad"}>{headline}</Badge>
          <span class="tiny muted">{L("डिवाइस पर गणना", "Computed on device")}</span>
        </div>
        <div class="stairs" style="margin-top:12px">
          <span class="done" style="height:26px" />
          <span class={result.outcome !== "NOT_ELIGIBLE" ? "done" : ""} style="height:32px" />
          <span class={result.outcome === "ELIGIBLE" ? "done" : result.outcome === "NEED_INFO" ? "now" : ""} style="height:38px" />
          <span style="height:44px" />
          <span style="height:50px" />
        </div>

        {result.outcome === "NOT_ELIGIBLE" ? (
          <p class="muted mt-3">
            {L("निर्णायक नियम", "Deciding rule")}: <strong>{result.rule}</strong>.{" "}
            {L(
              "यह नतीजा आपकी प्रोफ़ाइल और इस पैक के नियम से आया है — किसी अनुमान से नहीं।",
              "This outcome comes from your profile and this pack's rule, not from a model.",
            )}
          </p>
        ) : null}

        {result.outcome === "NEED_INFO" ? (
          <>
            <p class="muted mt-3">{L("ये जानकारी चाहिए", "These facts are needed")}:</p>
            <div class="row wrap mt-2">
              {result.missing.map((field) => (
                <Badge tone="warn" key={field}>{describeMissing(field)}</Badge>
              ))}
            </div>
            <button class="btn secondary small mt-3" onClick={() => navigate("/profile")}>
              {L("जानकारी जोड़ें", "Add the details")}
            </button>
          </>
        ) : null}
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("अगला कदम", "Next-Step Card")}</h3>
          <Badge tone="plain">{L("अंतिम तारीख", "Deadline")} {scheme.deadline}</Badge>
        </div>

        <div class="stack mt-3">
          <div class="list-item">
            <span class="leading saffron"><Icon name="file" size={17} /></span>
            <div class="grow">
              <strong style="font-size:0.85rem">{L("दस्तावेज़", "Documents")}</strong>
              <div class="row wrap mt-2">
                {scheme.documents.map((document) => (
                  <Badge tone="plain" key={document}>{document.replace(/_/g, " ")}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div class="list-item">
            <span class="leading teal"><Icon name="building" size={17} /></span>
            <div class="grow">
              <strong style="font-size:0.85rem">{L("कहाँ जाएँ", "Where")}</strong>
              <div class="tiny muted">{pickLocalised(scheme.place, language)}</div>
            </div>
          </div>
          <div class="list-item">
            <span class="leading plum"><Icon name="users" size={17} /></span>
            <div class="grow">
              <strong style="font-size:0.85rem">{L("मदद करने वाला", "Helper")}</strong>
              <div class="tiny muted">{scheme.helper.name} · {scheme.helper.phone}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("परिवार के लिए आवाज़", "Family Voice")}</h3>
          <Badge tone="info">{ttsAvailable() ? L("डिवाइस आवाज़", "Device voice") : L("पाठ", "Text only")}</Badge>
        </div>
        <p class="muted mt-2" style="font-size:0.9rem">
          {familyText}
        </p>
        <button class="btn secondary mt-3" onClick={playFamilyVoice}>
          <Icon name="mic" size={16} />
          {speaking ? L("सुन रहे हैं…", "Playing…") : L("सुनें", "Listen")}
        </button>
        <p class="tiny muted mt-2">
          {L(
            "डेमो में डिवाइस की आवाज़ चलती है। असली क्लिप पैक के साथ आ सकती हैं और बिना नेटवर्क चलती हैं।",
            "The demo uses device speech. Pre-recorded clips can ship inside the pack and work offline.",
          )}
        </p>
      </section>

      <SourceCite
        schemeId={scheme.id}
        rule={result.rule}
        packVersion={currentPack.version}
        source={scheme.source.url}
        verified={scheme.source.verified}
      />

      <p class="tiny muted mt-2">{scheme.source.note}</p>

      <div class="btn-row mt-3">
        <a class="btn secondary" href={scheme.source.url} target="_blank" rel="noreferrer noopener">
          {L("आधिकारिक पृष्ठ", "Official page")}
        </a>
        <button class="btn" onClick={() => navigate("/plan")}>
          {L("योजना में जोड़ें", "Open the plan")}
        </button>
      </div>

      {!packState.detail.includes("on this device") ? (
        <p class="tiny center mt-2">{packState.detail}</p>
      ) : null}
    </div>
  );
}
