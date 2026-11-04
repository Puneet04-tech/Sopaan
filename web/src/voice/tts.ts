// Output voice: device speech synthesis, with the written text always visible. Pre-recorded
// clips are a pack feature; the demo uses device TTS and says so.
import type { Lang } from "../i18n";
import { localeFor } from "../i18n";

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang: Lang): boolean {
  if (!ttsAvailable() || !text) return false;
  const synthesis = window.speechSynthesis;
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = localeFor(lang);
  utterance.rate = 0.88;
  utterance.pitch = 1;
  const voices = synthesis.getVoices();
  const match =
    voices.find((voice) => voice.lang === localeFor(lang)) ??
    voices.find((voice) => voice.lang.startsWith(lang === "en" ? "en" : "hi"));
  if (match) utterance.voice = match;
  synthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (ttsAvailable()) window.speechSynthesis.cancel();
}
