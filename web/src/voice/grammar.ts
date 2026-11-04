// Closed-vocabulary slot filling. A small grammar beats open dictation on a 2 GB phone,
// and every parse comes back with a confidence the student must confirm.
import type { Lang } from "../i18n";

export type SlotKind = "number" | "choice" | "multi";

export interface VoiceQuestion {
  field: string;
  kind: SlotKind;
  prompt: { hi: string; en: string };
  options?: { value: string; hi: string; en: string }[];
  sample: { hi: string; en: string };
  min?: number;
  max?: number;
}

export const VOICE_QUESTIONS: VoiceQuestion[] = [
  {
    field: "class_level",
    kind: "number",
    prompt: { hi: "आप किस कक्षा में पढ़ती हैं?", en: "Which class are you in?" },
    sample: { hi: "मैं दसवीं में हूँ", en: "I am in class ten" },
    min: 8,
    max: 12,
  },
  {
    field: "age",
    kind: "number",
    prompt: { hi: "आपकी उम्र कितनी है?", en: "How old are you?" },
    sample: { hi: "पंद्रह साल", en: "fifteen years" },
    min: 10,
    max: 60,
  },
  {
    field: "category",
    kind: "choice",
    prompt: { hi: "आपका वर्ग कौन सा है?", en: "Which category do you belong to?" },
    options: [
      { value: "OPEN", hi: "खुला", en: "Open" },
      { value: "OBC", hi: "ओबीसी", en: "OBC" },
      { value: "SC", hi: "अनुसूचित जाति", en: "SC" },
      { value: "ST", hi: "अनुसूचित जनजाति", en: "ST" },
      { value: "VJNT", hi: "विमुक्त जाति", en: "VJNT" },
      { value: "NT", hi: "भटक्या जमाती", en: "NT" },
    ],
    sample: { hi: "ओबीसी", en: "OBC" },
  },
  {
    field: "family_income",
    kind: "number",
    prompt: { hi: "परिवार की सालाना आय कितनी है?", en: "What is the family's yearly income?" },
    sample: { hi: "डेढ़ लाख रुपये", en: "one and a half lakh rupees" },
    min: 0,
    max: 2000000,
  },
  {
    field: "gender",
    kind: "choice",
    prompt: { hi: "आप लड़की हैं या लड़का?", en: "Are you a girl or a boy?" },
    options: [
      { value: "female", hi: "लड़की", en: "Girl" },
      { value: "male", hi: "लड़का", en: "Boy" },
      { value: "other", hi: "अन्य", en: "Other" },
    ],
    sample: { hi: "लड़की", en: "girl" },
  },
  {
    field: "marks_percent",
    kind: "number",
    prompt: { hi: "पिछली परीक्षा में कितने प्रतिशत अंक मिले?", en: "What percentage did you score last time?" },
    sample: { hi: "अड़सठ प्रतिशत", en: "sixty eight percent" },
    min: 0,
    max: 100,
  },
  {
    field: "interests",
    kind: "multi",
    prompt: { hi: "आपको क्या करना अच्छा लगता है?", en: "What do you like doing?" },
    options: [
      { value: "tailoring", hi: "सिलाई", en: "Tailoring" },
      { value: "design", hi: "डिज़ाइन", en: "Design" },
      { value: "repair", hi: "मरम्मत", en: "Repairing" },
      { value: "electronics", hi: "इलेक्ट्रॉनिक्स", en: "Electronics" },
      { value: "agriculture", hi: "खेती", en: "Farming" },
      { value: "business", hi: "व्यापार", en: "Business" },
      { value: "health", hi: "स्वास्थ्य", en: "Health" },
    ],
    sample: { hi: "सिलाई और डिज़ाइन", en: "tailoring and design" },
  },
];

const HINDI_NUMBERS: Record<string, number> = {
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "छः": 6,
  "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "तेरह": 13,
  "पंद्रह": 15, "बीस": 20, "तीस": 30, "चालीस": 40, "पचास": 50, "साठ": 60,
  "अड़सठ": 68, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90, "सौ": 100,
};

const INCOME_PHRASES: [RegExp, number][] = [
  [/डेढ़\s*लाख|1\.5\s*lakh|one and a half lakh/i, 150000],
  [/ढाई\s*लाख|2\.5\s*lakh/i, 250000],
  [/सवा\s*लाख|1\.25\s*lakh/i, 125000],
  [/(\d+(?:\.\d+)?)\s*लाख|(\d+(?:\.\d+)?)\s*lakh/i, 0],
];

const KEYWORDS: Record<string, Record<string, string[]>> = {
  category: {
    OPEN: ["खुला", "सामान्य", "open", "general"],
    OBC: ["ओबीसी", "obc", "अन्य पिछड़ा"],
    SC: ["अनुसूचित जाति", "एससी", "sc", "scheduled caste"],
    ST: ["अनुसूचित जनजाति", "एसटी", "st", "scheduled tribe", "आदिवासी"],
    VJNT: ["विमुक्त", "vjnt", "भटक्या"],
    NT: ["भटक्या जमाती", "nt", "nomadic"],
  },
  gender: {
    female: ["लड़की", "महिला", "स्त्री", "female", "girl", "woman"],
    male: ["लड़का", "पुरुष", "male", "boy", "man"],
    other: ["अन्य", "other"],
  },
  interests: {
    tailoring: ["सिलाई", "दर्जी", "tailor", "stitch"],
    design: ["डिज़ाइन", "design", "drawing", "डिजाइन"],
    repair: ["मरम्मत", "repair", "fix"],
    electronics: ["इलेक्ट्रॉनिक", "electronics", "solar", "wiring"],
    agriculture: ["खेती", "farm", "agriculture", "कृषि"],
    business: ["व्यापार", "business", "dukan", "दुकान"],
    health: ["स्वास्थ्य", "health", "nurse", "मरीज़"],
  },
};

function parseNumber(text: string): number | null {
  const digits = text.match(/\d+(?:\.\d+)?/);
  if (digits) return Number(digits[0]);
  for (const [word, value] of Object.entries(HINDI_NUMBERS)) {
    if (text.includes(word)) return value;
  }
  return null;
}

export interface ParsedSlot {
  value: unknown;
  confidence: number;
  matched: string;
}

export function parseAnswer(question: VoiceQuestion, transcript: string): ParsedSlot | null {
  const text = transcript.trim();
  if (!text) return null;

  if (question.field === "family_income") {
    for (const [pattern, value] of INCOME_PHRASES) {
      const match = text.match(pattern);
      if (match) {
        if (value > 0) return { value, confidence: 0.82, matched: match[0] };
        const lakhs = Number(match[1] ?? match[2]);
        if (!Number.isNaN(lakhs)) return { value: Math.round(lakhs * 100000), confidence: 0.75, matched: match[0] };
      }
    }
  }

  if (question.kind === "number") {
    const parsed = parseNumber(text);
    if (parsed === null) return null;
    const inRange = (question.min === undefined || parsed >= question.min) && (question.max === undefined || parsed <= question.max);
    return { value: parsed, confidence: inRange ? 0.78 : 0.4, matched: String(parsed) };
  }

  if (question.kind === "choice" && question.options) {
    for (const option of question.options) {
      const words = KEYWORDS[question.field]?.[option.value] ?? [option.en, option.hi];
      for (const word of words) {
        if (text.toLowerCase().includes(word.toLowerCase())) {
          return { value: option.value, confidence: 0.9, matched: word };
        }
      }
    }
    return null;
  }

  if (question.kind === "multi" && question.options) {
    const found: string[] = [];
    for (const option of question.options) {
      const words = KEYWORDS[question.field]?.[option.value] ?? [option.en, option.hi];
      if (words.some((word) => text.toLowerCase().includes(word.toLowerCase()))) found.push(option.value);
    }
    if (found.length === 0) return null;
    return { value: found, confidence: found.length > 1 ? 0.85 : 0.72, matched: found.join(", ") };
  }

  return null;
}

export function questionPrompt(question: VoiceQuestion, lang: Lang): string {
  return lang === "hi" ? question.prompt.hi : question.prompt.en;
}

export function sampleFor(question: VoiceQuestion, lang: Lang): string {
  return lang === "hi" ? question.sample.hi : question.sample.en;
}
