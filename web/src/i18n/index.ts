// UI strings in Hindi, Marathi and English. Scheme/career content comes from the signed
// pack, so adding a language is a data change, not a code release.
export type Lang = "hi" | "en" | "mr";

type Dict = Record<string, [string, string, string]>; // [hi, en, mr]

const strings: Dict = {
  "nav.home": ["घर", "Home", "घर"],
  "nav.discover": ["दिशा", "Discover", "दिशा"],
  "nav.plan": ["योजना", "Plan", "योजना"],
  "nav.prove": ["प्रमाण", "Prove", "पुरावा"],
  "nav.more": ["और", "More", "अधिक"],
  "common.continue": ["आगे बढ़ें", "Continue", "पुढे जा"],
  "common.back": ["वापस", "Back", "मागे"],
  "common.confirm": ["पुष्टि करें", "Confirm", "पुष्टी करा"],
  "common.cancel": ["रद्द करें", "Cancel", "रद्द करा"],
  "common.close": ["बंद करें", "Close", "बंद करा"],
  "common.save": ["सहेजें", "Save", "जतन करा"],
  "common.retry": ["फिर कोशिश करें", "Try again", "पुन्हा प्रयत्न करा"],
  "common.online": ["ऑनलाइन", "Online", "ऑनलाइन"],
  "common.offline": ["ऑफलाइन", "Offline", "ऑफलाइन"],
  "common.sync": ["सिंक करें", "Sync", "सिंक करा"],
  "common.syncing": ["सिंक हो रहा है", "Syncing", "सिंक होत आहे"],
  "common.pending": ["सिंक बाकी", "Pending sync", "सिंक बाकी"],
  "common.simulated": ["सिम्युलेटेड, नकद नहीं", "Simulated, not cash", "सिम्युलेटेड, रोख नाही"],
  "common.demo": ["डेमो", "Demo", "डेमो"],
  "common.settings": ["सेटिंग्स", "Settings", "सेटिंग्ज"],
  "common.tour": ["डेमो यात्रा", "Demo tour", "डेमो सफर"],
  "common.next": ["अगला कदम", "Next step", "पुढील पायरी"],
  "common.done": ["पूरा हुआ", "Done", "पूर्ण"],
  "common.why": ["यह नतीजा क्यों?", "Why this result?", "हा निकाल का?"],
  "common.source": ["स्रोत", "Source", "स्रोत"],
  "common.rule": ["नियम", "Rule", "नियम"],
  "common.version": ["संस्करण", "Version", "आवृत्ती"],
  "common.freshness": ["ताज़गी", "Freshness", "ताजेपण"],
  "common.registryAge": ["रजिस्ट्री की उम्र", "Registry age", "रजिस्ट्रीचे वय"],
  "common.validUntil": ["मान्यता", "Valid until", "वैधता"],
  "common.issuer": ["जारीकर्ता", "Issuer", "जारीकर्ता"],
  "common.skill": ["कौशल", "Skill", "कौशल"],
  "common.status": ["स्थिति", "Status", "स्थिती"],
  "common.amount": ["राशि", "Amount", "रक्कम"],
  "common.cap": ["सीमा", "Cap", "मर्यादा"],
  "common.spent": ["खर्च", "Spent", "खर्च"],
  "common.remaining": ["शेष", "Remaining", "शिल्लक"],
  "common.scan": ["QR स्कैन करें", "Scan QR", "QR स्कॅन करा"],
  "common.import": ["फ़ाइल खोलें", "Open file", "फाईल उघडा"],
  "common.issue": ["प्रमाण पत्र जारी करें", "Issue credential", "प्रमाणपत्र द्या"],
  "common.redeem": ["क्रेडिट इस्तेमाल करें", "Redeem credit", "क्रेडिट वापरा"],
  "common.install": ["लगाएँ", "Install", "इंस्टॉल करा"],
  "common.refresh": ["ताज़ा करें", "Refresh", "रिफ्रेश करा"],
  "common.learnMore": ["और जानें", "Learn more", "अधिक जाणून घ्या"],
  "common.language": ["भाषा", "Language", "भाषा"],
  "common.measured": ["इस फ़ोन पर मापा", "Measured on this phone", "या फोनवर मोजले"],
  "common.target": ["लक्ष्य", "Target", "लक्ष्य"],
};

export function t(key: string, lang: Lang): string {
  const entry = strings[key];
  if (!entry) return key;
  return lang === "hi" ? entry[0] : lang === "mr" ? entry[2] : entry[1];
}

export function localeFor(lang: Lang): string {
  return lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN";
}

export function pickLocalised(value: { en: string; hi: string; mr?: string } | undefined, lang: Lang): string {
  if (!value) return "";
  if (lang === "hi") return value.hi || value.en;
  if (lang === "mr") return value.mr || value.hi || value.en;
  return value.en;
}
