import { useState } from "preact/hooks";
import { lang, navigate, wallet, tokens, markTourStep, profile, loadDemoLearner, pack } from "../state";
import { t } from "../i18n";
import { Badge, Icon, PageHead } from "../components/ui";

interface Step {
  n: number;
  hi: string;
  en: string;
  detailHi: string;
  detailEn: string;
  route: string;
  done: boolean;
}

export function Tour() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [busy, setBusy] = useState(false);

  const fields = Object.keys(profile.value?.values ?? {}).length;
  const redeemed = tokens.value.some((token) => token.status === "REDEEMED" || token.status === "SETTLED");

  const steps: Step[] = [
    {
      n: 1,
      hi: "खोजें — आवाज़ से प्रोफ़ाइल",
      en: "Discover — a voice profile",
      detailHi: "राधा हिंदी में बोलती है, ऐप आइकन दिखाकर दोहराता है, वह पुष्टि करती है।",
      detailEn: "Radha speaks in Hindi, the app reads back with icons, she confirms each field.",
      route: "/profile",
      done: fields > 4,
    },
    {
      n: 2,
      hi: "सत्यापित पात्रता",
      en: "Verified eligibility",
      detailHi: "पॉलिटेक्निक पात्र है; छात्रवृत्ति अगली कक्षा से — दोनों अपना नियम, संस्करण और स्रोत दिखाते हैं।",
      detailEn: "Polytechnic is eligible; the scholarship unlocks next year — both cite rule, version and source.",
      route: "/act",
      done: fields > 4,
    },
    {
      n: 3,
      hi: "अगला कदम और परिवार की आवाज़",
      en: "Next-Step Card and Family Voice",
      detailHi: "दस्तावेज़, तारीख, जगह, मदद करने वाला — और परिवार के लिए ऑडियो।",
      detailEn: "Documents, deadline, place, helper — plus audio for the family.",
      route: "/act/POLY-DIPLOMA",
      done: fields > 4,
    },
    {
      n: 4,
      hi: "हवाई जहाज़ मोड",
      en: "Airplane mode",
      detailHi: "नेटवर्क बंद करें और वही जाँच दोबारा चलाएँ — कैश पैक से।",
      detailEn: "Turn the network off and run the same check from the cached pack.",
      route: "/act",
      done: pack.value !== null,
    },
    {
      n: 5,
      hi: "WhatsApp से नया पैक",
      en: "A newer pack by WhatsApp",
      detailHi: "नई हस्ताक्षरित पैक फ़ाइल आती है; हस्ताक्षर सही होने पर संस्करण बदलता है।",
      detailEn: "A newer signed pack arrives as a file; only a valid signature and version swaps it in.",
      route: "/sync",
      done: false,
    },
    {
      n: 6,
      hi: "कौशल प्रमाण",
      en: "Prove a skill",
      detailHi: "सुविधाकर्ता लीज़्ड कुंजी से हस्ताक्षर करता है; दूसरा फ़ोन QR से जाँचता है।",
      detailEn: "The facilitator signs with a leased key; a second phone verifies from a QR.",
      route: "/hub",
      done: wallet.value.length > 0,
    },
    {
      n: 7,
      hi: "नाकामी के केस",
      en: "Failure cases",
      detailHi: "छेड़ा हुआ प्रमाण अस्वीकृत; पुरानी रजिस्ट्री की चेतावनी दिखती है।",
      detailEn: "A tampered credential is rejected; a stale-registry warning is visible.",
      route: "/verify",
      done: false,
    },
    {
      n: 8,
      hi: "धन प्रमाण के बाद",
      en: "Money follows proof",
      detailHi: "वैध प्रमाण के बाद ही सिम्युलेटेड क्रेडिट खुलता है; सिंक पर मिलान होता है।",
      detailEn: "Simulated credit unlocks only after a valid credential, then reconciles at sync.",
      route: "/credits",
      done: redeemed,
    },
  ];

  const current = steps.find((step) => !step.done) ?? steps[steps.length - 1];

  async function start() {
    setBusy(true);
    if (fields <= 4) await loadDemoLearner();
    await markTourStep(1);
    navigate("/profile");
    setBusy(false);
  }

  return (
    <div class="screen">
      <PageHead
        kicker={t("common.tour", language)}
        title={L("राधा की कहानी", "Radha's story")}
        sub={L(
          "आठ कदम: खोज से लेकर प्रमाण तक, और प्रमाण से धन तक। हर कदम बिना नेटवर्क चलता है।",
          "Eight steps from discovery to proof, and from proof to funding. Every one works offline.",
        )}
      />

      <section class="card tint" style="margin-bottom:14px">
        <div class="row-between">
          <div>
            <div class="card-kicker">{L("कदम", "Step")} {current.n} / 8</div>
            <h2 style="margin-top:4px">{L(current.hi, current.en)}</h2>
            <p class="muted mt-2">{L(current.detailHi, current.detailEn)}</p>
          </div>
          <div class="tour-strip" style="width:90px;flex-wrap:wrap">
            {steps.map((step) => (
              <span key={step.n} class={step.done ? "done" : step.n === current.n ? "now" : ""} style="flex:1 0 20%;height:5px" />
            ))}
          </div>
        </div>
        <div class="btn-row mt-3">
          <button class="btn secondary" onClick={() => navigate(current.route)}>
            {L("इस कदम पर जाएँ", "Go to this step")}
          </button>
          <button class="btn saffron" disabled={busy} onClick={start}>
            {busy ? t("common.syncing", language) : fields > 4 ? L("फिर से शुरू", "Restart") : L("प्रोफ़ाइल भरें", "Load the profile")}
          </button>
        </div>
      </section>

      <div class="list">
        {steps.map((step) => (
          <button
            key={step.n}
            class="list-item"
            style={`text-align:left;font-family:inherit;color:inherit;width:100%;cursor:pointer;${step.n === current.n ? "border-color:var(--saffron);background:var(--saffron-soft)" : ""}`}
            onClick={() => navigate(step.route)}
          >
            <span class={`leading ${step.done ? "good" : ""}`}>{step.done ? <Icon name="check" size={17} /> : step.n}</span>
            <span class="grow">
              <span style="display:block;font-weight:800">{L(step.hi, step.en)}</span>
              <span class="tiny muted">{L(step.detailHi, step.detailEn)}</span>
            </span>
            {step.n === current.n ? <Badge tone="warn">{L("अभी", "Now")}</Badge> : null}
          </button>
        ))}
      </div>

      <p class="tiny muted center" style="margin-top:14px">
        {L(
          "यह डेमो है: क्रेडिट नकद नहीं, कुंजियाँ डेमो की हैं, और नियमों को असली उपयोग से पहले दोबारा जाँचना ज़रूरी है।",
          "This is a demo: credits are not cash, keys are demo keys, and rules must be re-verified before real use.",
        )}
      </p>
    </div>
  );
}
