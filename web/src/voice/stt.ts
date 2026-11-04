// Voice input has three honest tiers: a closed-grammar recognizer if a Vosk model has been
// downloaded, the browser's online recogniser as an upgrade path, and the icon picker that
// always works. The UI records which tier produced a value on every field.
import type { Lang } from "../i18n";
import { localeFor } from "../i18n";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export interface ListenResult {
  transcript: string;
  confidence: number;
  mode: "browser" | "unavailable";
}

/** Online browser recognition. Raw audio never goes to our servers. */
export function listenOnce(lang: Lang, timeoutMs = 7000): Promise<ListenResult> {
  return new Promise((resolve) => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      resolve({ transcript: "", confidence: 0, mode: "unavailable" });
      return;
    }
    const recognizer = new Ctor();
    recognizer.lang = localeFor(lang);
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    let settled = false;
    const finish = (result: ListenResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        recognizer.stop();
      } catch {
        /* already stopped */
      }
      resolve(result);
    };
    const timer = window.setTimeout(() => finish({ transcript: "", confidence: 0, mode: "unavailable" }), timeoutMs);
    recognizer.onresult = (event) => {
      const alternative = event.results?.[0]?.[0];
      finish({
        transcript: alternative?.transcript ?? "",
        confidence: alternative?.confidence ?? 0.6,
        mode: "browser",
      });
    };
    recognizer.onerror = () => finish({ transcript: "", confidence: 0, mode: "unavailable" });
    recognizer.onend = () => finish({ transcript: "", confidence: 0, mode: "unavailable" });
    try {
      recognizer.start();
    } catch {
      finish({ transcript: "", confidence: 0, mode: "unavailable" });
    }
  });
}

export function speechInputAvailable(): boolean {
  return recognitionCtor() !== null;
}
