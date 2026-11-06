// Offline speech tier (design 5.1.4). The recogniser is a Vosk WASM build running a model that
// the operator drops into /public/models/vosk-<lang>. It is driven by a closed grammar built
// from the question's own vocabulary, so a small model stays accurate, and nothing leaves the
// device. When the model is absent the app says so and falls back to the browser recogniser,
// then to icons — it never pretends a microphone worked.
import { VOICE_QUESTIONS, type VoiceQuestion } from "./grammar";

export type SpeechTier = "model" | "browser" | "keyboard";

export interface OfflineRecognizer {
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

interface VoskModule {
  createModel?: (url: string) => Promise<VoskModel>;
}

interface VoskModel {
  KaldiRecognizer: (sampleRate: number, grammar: string) => VoskRecognizer;
  terminate?: () => void;
}

interface VoskRecognizer {
  on?: (event: string, handler: (message: { result?: { text?: string } }) => void) => void;
  acceptWaveform: (buffer: AudioBuffer) => boolean;
  remove?: () => void;
}

export const MODEL_DIR = "/models";
export const MODEL_SAMPLE_RATE = 16_000;

/** The closed vocabulary for one question, in the shape Vosk expects. */
export function buildVoskGrammar(question: VoiceQuestion): string {
  const words = new Set<string>(["हाँ", "नहीं", "yes", "no", "अंक", "प्रतिशत", "साल", "रुपये"]);
  for (const option of question.options ?? []) {
    [option.hi, option.en, option.value].forEach((word) => words.add(word.toLowerCase()));
  }
  if (question.kind === "number") {
    [
      "एक", "दो", "तीन", "चार", "पांच", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह",
      "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस", "तीस", "चालीस", "पचास",
      "साठ", "सत्तर", "अस्सी", "नब्बे", "सौ", "लाख", "हज़ार",
      "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
      "eleven", "twelve", "fifteen", "twenty", "fifty", "hundred", "thousand", "lakh",
      ...Array.from({ length: 101 }, (_, index) => String(index)),
    ].forEach((word) => words.add(word));
  }
  const list = Array.from(words).filter(Boolean);
  return JSON.stringify([...list, "[unk]"]);
}

function voskModelUrl(lang: string): string {
  const folder = lang === "en" ? "vosk-en" : `vosk-${lang}`;
  return `${MODEL_DIR}/${folder}`;
}

async function loadVosk(): Promise<VoskModule | null> {
  try {
    const spec = "vosk-browser";
    const module = (await import(/* @vite-ignore */ spec)) as unknown as VoskModule;
    return typeof module?.createModel === "function" ? module : null;
  } catch {
    return null;
  }
}

async function modelInstalled(url: string): Promise<boolean> {
  try {
    const head = await fetch(`${url}/README.txt`, { method: "HEAD" });
    return head.ok;
  } catch {
    return false;
  }
}

export interface OfflineStatus {
  tier: SpeechTier;
  reason?: string;
}

/** What speech input can do on this device right now, said plainly. */
export async function offlineSpeechStatus(): Promise<OfflineStatus> {
  const module = await loadVosk();
  if (!module) return { tier: "keyboard", reason: "recognizer_not_installed" };
  const installed = (await modelInstalled(voskModelUrl("hi"))) || (await modelInstalled(voskModelUrl("en")));
  if (!installed) return { tier: "keyboard", reason: "model_not_installed" };
  return { tier: "model" };
}

export interface OfflineListenResult {
  transcript: string;
  confidence: number;
  tier: SpeechTier;
}

/**
 * Listen with the offline recogniser. Resolves with tier "keyboard" (and no transcript) when
 * the model is missing, so the caller can switch to icons without a dead end.
 */
export async function listenOffline(
  question: VoiceQuestion,
  lang: string,
  timeoutMs = 8000,
): Promise<OfflineListenResult> {
  const module = await loadVosk();
  if (!module) return { transcript: "", confidence: 0, tier: "keyboard" };
  const url = voskModelUrl(lang === "en" ? "en" : lang);
  if (!(await modelInstalled(url))) return { transcript: "", confidence: 0, tier: "keyboard" };

  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: MODEL_SAMPLE_RATE } });
    const model = await module.createModel!(url);
    const recognizer = model.KaldiRecognizer(MODEL_SAMPLE_RATE, buildVoskGrammar(question));
    context = new AudioContext({ sampleRate: MODEL_SAMPLE_RATE });
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);

    let transcript = "";
    recognizer.on?.("result", (message) => {
      const text = message?.result?.text;
      if (text) transcript = text;
    });

    return await new Promise<OfflineListenResult>((resolve) => {
      const finish = () => {
        processor.disconnect();
        source.disconnect();
        recognizer.remove?.();
        model.terminate?.();
        stream?.getTracks().forEach((track) => track.stop());
        void context?.close();
        resolve({ transcript, confidence: transcript ? 0.8 : 0, tier: "model" });
      };
      processor.onaudioprocess = (event) => {
        recognizer.acceptWaveform(event.inputBuffer);
      };
      source.connect(processor);
      processor.connect(context!.destination);
      window.setTimeout(finish, timeoutMs);
    });
  } catch {
    stream?.getTracks().forEach((track) => track.stop());
    void context?.close();
    return { transcript: "", confidence: 0, tier: "keyboard" };
  }
}

export function questions(): VoiceQuestion[] {
  return VOICE_QUESTIONS;
}
