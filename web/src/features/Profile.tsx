import { useEffect, useMemo, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { formatRupees } from "../core/format";
import { lang, profile, confirmProfileFields, notify } from "../state";
import { t, pickLocalised, type Lang } from "../i18n";
import { CATEGORY_OPTIONS, EDUCATION_OPTIONS, INTEREST_OPTIONS, SKILL_OPTIONS, type FieldConfirmation } from "../data/profile";
import { Badge, Icon, Modal, PageHead } from "../components/ui";
import {
  VOICE_QUESTIONS,
  parseAnswer,
  sampleFor,
  type VoiceQuestion,
} from "../voice/grammar";
import { listenOnce, speechInputAvailable } from "../voice/stt";
import { listenOffline, offlineSpeechStatus, type SpeechTier } from "../voice/offline";
import { speak, ttsAvailable } from "../voice/tts";

const SOURCE_LABEL: Record<string, string> = {
  stt: "voice",
  icon: "icon",
  facilitator: "facilitator",
  form: "typed",
};

const QUICK_VALUES: Record<string, number[]> = {
  class_level: [9, 10, 11, 12],
  age: [14, 15, 16, 17, 18],
  family_income: [100000, 150000, 250000, 400000],
  marks_percent: [45, 55, 68, 80],
};

function FieldReadback({ field, value, language }: { field: string; value: unknown; language: Lang }) {
  if (field === "family_income") {
    return (
      <div class="row">
        <Icon name="coins" size={22} />
        <strong>{formatRupees(Number(value))}</strong>
      </div>
    );
  }
  if (field === "class_level") {
    return (
      <div class="row">
        <Icon name="book" size={22} />
        <strong>{language === "en" ? `Class ${value}` : `कक्षा ${value}`}</strong>
      </div>
    );
  }
  if (field === "marks_percent") {
    return (
      <div class="row">
        <Icon name="spark" size={22} />
        <strong>{String(value)}%</strong>
      </div>
    );
  }
  if (field === "interest" || field === "interests") {
    const values = Array.isArray(value) ? (value as string[]) : [String(value)];
    return (
      <div class="row wrap">
        {values.map((entry) => {
          const option = INTEREST_OPTIONS.find((item) => item.id === entry);
          return (
            <Badge tone="plum" key={entry}>
              {option ? pickLocalised({ en: option.en, hi: option.hi }, language) : entry}
            </Badge>
          );
        })}
      </div>
    );
  }
  if (field === "gender") {
    const label = value === "female" ? (language === "en" ? "Girl" : "लड़की") : value === "male" ? (language === "en" ? "Boy" : "लड़का") : "Other";
    return (
      <div class="row">
        <Icon name="heart" size={22} />
        <strong>{label}</strong>
      </div>
    );
  }
  return (
    <div class="row">
      <Icon name="check" size={22} />
      <strong>{String(value)}</strong>
    </div>
  );
}

export function Profile() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const snapshot = profile.value;
  const [index, setIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [mode, setMode] = useState<"stt" | "icon" | "form" | null>(null);
  const [parsed, setParsed] = useState<{ value: unknown; confidence: number } | null>(null);
  const [readbackOpen, setReadbackOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const form = useSignal<Record<string, string>>({});
  const multi = useSignal<string[]>([]);
  const [speechTier, setSpeechTier] = useState<SpeechTier>("keyboard");

  useEffect(() => {
    void offlineSpeechStatus().then((status) => setSpeechTier(status.tier));
  }, []);

  const questions = VOICE_QUESTIONS;
  const question = questions[Math.min(index, questions.length - 1)];
  const answered = Object.keys(snapshot?.values ?? {}).length;
  const completeness = Math.min(1, answered / 12);

  const confirmedRows = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.values)
      .filter(([field]) => field !== "student_name")
      .map(([field, value]) => ({
        field,
        value,
        conf: snapshot.confidence[field] ?? 1,
        source: snapshot.sources[field] ?? "form",
      }));
  }, [snapshot]);

  function beginReadback(questionDef: VoiceQuestion, value: unknown, confidence: number, nextMode: "stt" | "icon" | "form") {
    setParsed({ value, confidence });
    setMode(nextMode);
    setReadbackOpen(true);
    if (ttsAvailable()) {
      const spoken =
        questionDef.field === "family_income"
          ? `${language === "en" ? "Family income" : "परिवार की आय"} ${formatRupees(Number(value))}`
          : String(Array.isArray(value) ? value.join(", ") : value);
      speak(spoken, language);
    }
  }

  async function listen(): Promise<void> {
    setListening(true);
    // Offline closed grammar first: it never sends audio anywhere. The browser recogniser is the
    // online upgrade, and icons are the floor nobody can fall through.
    const offline = await listenOffline(question, language);
    if (offline.transcript) {
      setListening(false);
      setTranscript(offline.transcript);
      const slot = parseAnswer(question, offline.transcript);
      if (slot) beginReadback(question, slot.value, slot.confidence, "stt");
      else setMode("icon");
      return;
    }
    const result = await listenOnce(language);
    setListening(false);
    if (!result.transcript) {
      setTranscript("");
      setMode("icon");
      notify(
        L(
          "इस फ़ोन पर बोलकर जवाब देने की सुविधा नहीं है — आइकन या लिखकर चुनें।",
          "Voice input is not available on this phone — use the icons or type instead.",
        ),
        "warn",
      );
      return;
    }
    setTranscript(result.transcript);
    const slot = parseAnswer(question, result.transcript);
    if (slot) beginReadback(question, slot.value, slot.confidence, "stt");
    else setMode("icon");
  }

  function useSample(): void {
    const sample = sampleFor(question, language);
    setTranscript(sample);
    const slot = parseAnswer(question, sample);
    if (slot) beginReadback(question, slot.value, slot.confidence, "stt");
  }

  function pickIcon(value: string | number): void {
    beginReadback(question, value, 1, "icon");
  }

  function pickMulti(value: string): void {
    multi.value = multi.value.includes(value)
      ? multi.value.filter((entry) => entry !== value)
      : [...multi.value, value];
  }

  async function confirm(): Promise<void> {
    if (!parsed) return;
    const fields: FieldConfirmation[] = [
      {
        field: question.field,
        value: parsed.value,
        conf: parsed.confidence,
        source: mode === "stt" ? "stt" : "icon",
      },
    ];
    if (question.field === "class_level") {
      const level = Number(parsed.value);
      const education = level >= 11 ? "CLASS_12" : level >= 9 ? "CLASS_8" : "NONE";
      fields.push({ field: "education_level", value: education, conf: 0.9, source: "icon" });
    }
    await confirmProfileFields(fields);
    setReadbackOpen(false);
    setParsed(null);
    setTranscript("");
    multi.value = [];
    setIndex((current) => (current + 1) % questions.length);
  }

  return (
    <div class="screen">
      <PageHead
        kicker={L("आवाज़ या आइकन", "Voice or icons")}
        title={L("अपनी बात, अपनी भाषा में", "Your story, in your language")}
        sub={L(
          "हर जवाब दोहराया जाता है। जब तक आप पुष्टि नहीं करते, वह तथ्य नहीं बनता।",
          "Every answer is read back. Nothing becomes a fact until you confirm it.",
        )}
        action={<Badge tone={completeness >= 1 ? "good" : "warn"}>{Math.round(completeness * 100)}%</Badge>}
      />

      <div class="meter" style="margin-bottom:14px">
        <span style={`width:${Math.max(4, completeness * 100)}%`} />
      </div>

      <section class="card" style="margin-bottom:14px">
        <div class="row-between">
          <span class="card-kicker">
            {L("सवाल", "Question")} {Math.min(index + 1, questions.length)} / {questions.length}
          </span>
          <div class="row" style="gap:6px">
            <Badge tone={speechTier === "model" ? "good" : "plain"}>
              {speechTier === "model"
                ? L("ऑफ़लाइन आवाज़", "Offline voice")
                : speechInputAvailable()
                  ? L("माइक (ऑनलाइन)", "Mic (online)")
                  : L("आइकन चुनें", "Use icons")}
            </Badge>
          </div>
        </div>
        <h2 style="margin-top:8px">
          {language === "en" ? question.prompt.en : question.prompt.hi}
        </h2>

        {transcript ? <p class="muted mt-2">“{transcript}”</p> : null}

        {question.kind === "multi" && question.options ? (
          <div class="row wrap mt-3">
            {question.options.map((option) => (
              <button
                key={option.value}
                class="chip"
                aria-pressed={multi.value.includes(option.value)}
                onClick={() => pickMulti(option.value)}
              >
                <span class="dot" />
                {language === "en" ? option.en : option.hi}
              </button>
            ))}
          </div>
        ) : null}

        {question.kind === "multi" && question.options ? (
          <button
            class="btn mt-3"
            disabled={multi.value.length === 0}
            onClick={() => beginReadback(question, multi.value, 0.95, "icon")}
          >
            {t("common.continue", language)}
          </button>
        ) : question.kind === "choice" && question.options ? (
          <div class="row wrap mt-3">
            {question.options.map((option) => (
              <button key={option.value} class="chip" onClick={() => pickIcon(option.value)}>
                {language === "en" ? option.en : option.hi}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div class="row wrap mt-3">
              {(QUICK_VALUES[question.field] ?? []).map((value) => (
                <button class="chip" key={value} onClick={() => pickIcon(value)}>
                  {question.field === "family_income" ? formatRupees(value) : value}
                </button>
              ))}
            </div>
            <div class="form-grid mt-3">
              <div class="field">
                <label for="quick-value">{L("या लिखें", "Or type")}</label>
                <input
                  id="quick-value"
                  class="input"
                  inputmode="numeric"
                  placeholder={question.field === "family_income" ? "180000" : ""}
                  onBlur={(event) => {
                    const raw = (event.target as HTMLInputElement).value;
                    const value = Number(raw);
                    if (raw !== "" && !Number.isNaN(value)) beginReadback(question, value, 1, "form");
                  }}
                />
              </div>
            </div>
          </>
        )}

        <div class="btn-row mt-3">
          <button class="btn secondary" onClick={useSample}>
            <Icon name="mic" size={16} />
            {L("नमूना जवाब", "Sample answer")}
          </button>
          <button class="btn" disabled={listening} onClick={listen}>
            <Icon name="mic" size={16} />
            {listening ? L("सुन रहे हैं…", "Listening…") : L("बोलें", "Speak")}
          </button>
        </div>

        <p class="tiny muted mt-2">
          {L(
            "माइक उपलब्ध न हो तो आइकन हमेशा काम करते हैं। ऑडियो डिफ़ॉल्ट रूप से फ़ोन से बाहर नहीं जाता।",
            "Icons always work when the mic does not. Audio does not leave the phone by default.",
          )}
        </p>
      </section>

      <div class="row-between" style="margin:0 2px 8px">
        <h3>{L("पुष्टि किए तथ्य", "Confirmed facts")}</h3>
        <button class="link-btn" onClick={() => setManualOpen(true)}>{L("फ़ॉर्म से भरें", "Fill the form")}</button>
      </div>

      {confirmedRows.length === 0 ? (
        <div class="callout">{L("अभी कोई तथ्य पुष्टि नहीं हुआ।", "No facts confirmed yet.")}</div>
      ) : (
        <div class="list">
          {confirmedRows.map((row) => (
            <div class="list-item" key={row.field}>
              <span class={`leading ${row.conf >= 0.85 ? "good" : "saffron"}`}>
                <Icon name="check" size={16} />
              </span>
              <div class="grow">
                <div class="row-between">
                  <strong style="font-size:0.84rem;text-transform:capitalize">{row.field.replace(/_/g, " ")}</strong>
                  <span class="tiny muted">{Math.round(row.conf * 100)}% · {SOURCE_LABEL[row.source] ?? row.source}</span>
                </div>
                <div class="tiny" style="margin-top:2px">
                  {Array.isArray(row.value) ? (row.value as string[]).join(", ") : String(row.value)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={readbackOpen} onClose={() => setReadbackOpen(false)} title={L("क्या यह सही है?", "Is this right?")}>
        <p class="muted">{L("ऐप ने यह समझा:", "The app understood:")}</p>
        <div class="card tint mt-2" style="box-shadow:none">
          <FieldReadback field={question.field} value={parsed?.value} language={language} />
          {parsed ? (
            <div class="row wrap mt-2">
              <Badge tone={parsed.confidence >= 0.85 ? "good" : parsed.confidence >= 0.6 ? "warn" : "bad"}>
                {Math.round(parsed.confidence * 100)}% {L("भरोसा", "confidence")}
              </Badge>
              <Badge tone="plain">{mode === "stt" ? L("आवाज़ से", "from voice") : L("आइकन से", "from icons")}</Badge>
            </div>
          ) : null}
        </div>
        <div class="btn-row mt-3">
          <button class="btn secondary" onClick={() => setReadbackOpen(false)}>{L("नहीं, बदलें", "No, change")}</button>
          <button class="btn saffron" onClick={confirm}>{t("common.confirm", language)}</button>
        </div>
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title={L("प्रोफ़ाइल भरें", "Fill the profile")}>
        <div class="stack">
          <div class="field">
            <label>{L("कक्षा", "Class")}</label>
            <select class="select" onChange={(event) => (form.value = { ...form.value, class_level: (event.target as HTMLSelectElement).value })}>
              <option value="">—</option>
              {[8, 9, 10, 11, 12].map((value) => (
                <option value={value} key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>{L("वर्ग", "Category")}</label>
            <select class="select" onChange={(event) => (form.value = { ...form.value, category: (event.target as HTMLSelectElement).value })}>
              <option value="">—</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option value={option} key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>{L("आय (₹/वर्ष)", "Income (₹/year)")}</label>
              <input class="input" inputmode="numeric" onInput={(event) => (form.value = { ...form.value, family_income: (event.target as HTMLInputElement).value })} />
            </div>
            <div class="field">
              <label>{L("उम्र", "Age")}</label>
              <input class="input" inputmode="numeric" onInput={(event) => (form.value = { ...form.value, age: (event.target as HTMLInputElement).value })} />
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label>{L("लिंग", "Gender")}</label>
              <select class="select" onChange={(event) => (form.value = { ...form.value, gender: (event.target as HTMLSelectElement).value })}>
                <option value="">—</option>
                <option value="female">{L("लड़की", "Girl")}</option>
                <option value="male">{L("लड़का", "Boy")}</option>
                <option value="other">{L("अन्य", "Other")}</option>
              </select>
            </div>
            <div class="field">
              <label>{L("अंक %", "Marks %")}</label>
              <input class="input" inputmode="numeric" onInput={(event) => (form.value = { ...form.value, marks_percent: (event.target as HTMLInputElement).value })} />
            </div>
          </div>
          <div class="field">
            <label>{L("शिक्षा स्तर", "Education level")}</label>
            <select class="select" onChange={(event) => (form.value = { ...form.value, education_level: (event.target as HTMLSelectElement).value })}>
              <option value="">—</option>
              {EDUCATION_OPTIONS.map((option) => (
                <option value={option} key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label>{L("रुचियाँ (कोड, कॉमा से)", "Interests (codes, comma separated)")}</label>
            <input
              class="input"
              placeholder="tailoring, design"
              onInput={(event) => {
                const raw = (event.target as HTMLInputElement).value;
                form.value = { ...form.value, interests: raw };
              }}
            />
            <span class="hint">{INTEREST_OPTIONS.slice(0, 6).map((option) => option.id).join(", ")}</span>
          </div>
          <div class="field">
            <label>{L("कौशल", "Skills")}</label>
            <input
              class="input"
              placeholder="stitching, measurement"
              onInput={(event) => {
                const raw = (event.target as HTMLInputElement).value;
                form.value = { ...form.value, skills: raw };
              }}
            />
            <span class="hint">{SKILL_OPTIONS.slice(0, 5).map((option) => option.id).join(", ")}</span>
          </div>
        </div>
        <button
          class="btn mt-3"
          onClick={async () => {
            const values: Record<string, string> = { ...form.value };
            const interests = values.interests?.split(",").map((entry) => entry.trim()).filter(Boolean);
            const skills = values.skills?.split(",").map((entry) => entry.trim()).filter(Boolean);
            delete values.interests;
            delete values.skills;
            const fields: { field: string; value: unknown; conf: number; source: "form" }[] = Object.entries(values)
              .filter(([, raw]) => raw !== "")
              .map(([field, raw]) => ({
                field,
                value: ["class_level", "age", "family_income", "marks_percent"].includes(field) ? Number(raw) : raw,
                conf: 1,
                source: "form",
              }));
            if (interests && interests.length > 0) fields.push({ field: "interests", value: interests, conf: 1, source: "form" });
            if (skills && skills.length > 0) fields.push({ field: "skills", value: skills, conf: 1, source: "form" });
            await confirmProfileFields(fields);
            setManualOpen(false);
          }}
        >
          {t("common.save", language)}
        </button>
      </Modal>

      <p class="tiny muted center" style="margin-top:14px">
        {L("अगला कदम: ", "Next: ")}
        {EDUCATION_OPTIONS.includes(String(snapshot?.values.education_level ?? "")) ? "" : ""}
        <button class="link-btn" onClick={() => (window.location.hash = "#/discover")}>
          {L("करियर विकल्प देखें →", "See career options →")}
        </button>
      </p>
    </div>
  );
}
