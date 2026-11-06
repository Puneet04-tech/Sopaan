import { lang, navigate, wallet, pack } from "../state";
import { t } from "../i18n";
import { canAdmin, canFacilitate, canReview, canSponsor, currentRole } from "../data/roles";
import { Icon, PageHead, Badge } from "../components/ui";

/** Which role may open an item; absent means every signed-in learner. */
const NEEDS: Record<string, () => boolean> = {
  "/hub": canFacilitate,
  "/review": canReview,
  "/sponsor": canSponsor,
};

const GROUPS = [
  {
    title: { hi: "सीखें और योजना बनाएँ", en: "Learn and plan" },
    items: [
      { path: "/discover", icon: "compass", hi: "करियर खोजें", en: "Career discovery" },
      { path: "/plan", icon: "route", hi: "मेरा रास्ता", en: "My pathway" },
      { path: "/act", icon: "file", hi: "पात्रता और अगला कदम", en: "Eligibility and next step" },
    ],
  },
  {
    title: { hi: "प्रमाण और धन", en: "Proof and funding" },
    items: [
      { path: "/prove", icon: "id", hi: "स्किल पासपोर्ट", en: "Skill Passport" },
      { path: "/verify", icon: "qr", hi: "QR से जाँचें", en: "Verify a QR" },
      { path: "/credits", icon: "coins", hi: "क्रेडिट", en: "Credits" },
    ],
  },
  {
    title: { hi: "सुविधाकर्ता और प्रशासन", en: "Facilitator and governance" },
    items: [
      { path: "/hub", icon: "users", hi: "सुविधाकर्ता हब", en: "Facilitator hub" },
      { path: "/review", icon: "shield", hi: "नियम समीक्षा", en: "Rule review" },
      { path: "/sponsor", icon: "building", hi: "प्रायोजक दृश्य", en: "Sponsor view" },
    ],
  },
  {
    title: { hi: "सिस्टम", en: "System" },
    items: [
      { path: "/sync", icon: "sync", hi: "सिंक और पैक", en: "Sync and packs" },
      { path: "/settings", icon: "settings", hi: "सेटिंग्स और गोपनीयता", en: "Settings and privacy" },
      { path: "/tour", icon: "spark", hi: "डेमो यात्रा", en: "Demo tour" },
      { path: "/welcome", icon: "book", hi: "सोपान के बारे में", en: "About Sopaan" },
    ],
  },
];

export function More() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);

  return (
    <div class="screen">
      <PageHead
        kicker={t("nav.more", language)}
        title={L("सब कुछ एक जगह", "Everything in one place")}
        sub={L(
          "एक ही फ़ोन, एक ही ऐप — छात्रा, शिक्षक और सत्यापनकर्ता के लिए।",
          "One phone, one app — for the student, the teacher and the verifier.",
        )}
      />

      <section class="card dark" style="margin-bottom:14px">
        <div class="row-between">
          <div>
            <div class="card-kicker" style="color:rgba(247,243,234,0.6)">Skill Passport</div>
            <h2 style="color:#fff8ea">{wallet.value.length} {L("हस्ताक्षरित प्रमाण", "signed credentials")}</h2>
          </div>
          <button class="btn saffron small" onClick={() => navigate("/prove")}>
            {L("खोलें", "Open")}
          </button>
        </div>
        <p class="tiny" style="margin-top:8px">
          {L(
            "हस्ताक्षर चैनल पर नहीं, दस्तावेज़ पर निर्भर है। QR, फ़ाइल या WhatsApp — जाँच वही रहती है।",
            "Trust lives in the signature, not the channel: QR, file or WhatsApp verify the same way.",
          )}
        </p>
      </section>

      <div class="stack-lg">
        {GROUPS.map((group) => {
          const items = group.items.filter((item) => (NEEDS[item.path] ? NEEDS[item.path]() : true));
          if (items.length === 0) return null;
          return (
          <section key={group.title.en}>
            <div class="row-between" style="margin:0 2px 8px">
              <h3>{L(group.title.hi, group.title.en)}</h3>
              <span class="tiny muted">{items.length}</span>
            </div>
            <div class="list">
              {items.map((item) => (
                <button
                  key={item.path}
                  class="list-item"
                  style="text-align:left;cursor:pointer;font-family:inherit;color:inherit;width:100%"
                  onClick={() => navigate(item.path)}
                >
                  <span class="leading">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span class="grow">
                    <span style="display:block;font-weight:800">{L(item.hi, item.en)}</span>
                    <span class="tiny muted">{item.en}</span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          </section>
          );
        })}
      </div>

      <div class="row wrap" style="margin:16px 2px;justify-content:center">
        <Badge tone="plain">pack {pack.value?.version ?? "—"}</Badge>
        <Badge tone="plum">{L("भूमिका: " + currentRole(), "role: " + currentRole())}</Badge>
        {canAdmin() && <Badge tone="good">{L("प्रशासक", "administrator")}</Badge>}
      </div>
    </div>
  );
}
