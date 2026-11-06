// One reactive store for the shell. Screens read signals; every write goes through the
// data layer so the outbox and the local record stay in step.
import { computed, signal } from "@preact/signals";
import { decodePayload, type PackPayload, type RegistryPayload } from "./core/envelope";
import type { AllowanceRow, TokenRow, CredentialRow } from "./data/db";
import type { OutboxSummary } from "./data/outbox";
import { activeAccountKey, db, ensureIdentity, getSetting, setSetting, useAccount, type DeviceIdentity } from "./data/db";
import { getAuthToken, getAuthUserId } from "./data/auth";
import { connectRealtime, type RealtimeHandle } from "./data/realtime";
import { ensureArtifacts, fetchLatestArtifacts, getActivePack, importPackText } from "./data/packs";
import { confirmFields, loadProfile, seedDemoProfile, type FieldConfirmation, type ProfileSnapshot } from "./data/profile";
import { refreshWallet } from "./data/wallet";
import { ensureAllowance, getAllowance, listTokens } from "./data/credits";
import { ensureRoster } from "./data/hub";
import { outboxSummary } from "./data/outbox";
import { getConflicts, lastSyncAt, serverBase, syncAll } from "./data/sync";
import type { Lang } from "./i18n";
import { t } from "./i18n";

export type SyncPhase = "idle" | "syncing" | "ok" | "offline" | "error";
export type Theme = "dark" | "light";

export const lang = signal<Lang>("hi");
export const theme = signal<Theme>("dark");
export const landingSeen = signal(false);
export const route = signal<string>("/");
export const ready = signal(false);
export const bootError = signal<string | null>(null);
export const identity = signal<DeviceIdentity | null>(null);
export const pack = signal<PackPayload | null>(null);
export const registry = signal<RegistryPayload | null>(null);
export const profile = signal<ProfileSnapshot | null>(null);
export const wallet = signal<CredentialRow[]>([]);
export const allowance = signal<AllowanceRow | null>(null);
export const tokens = signal<TokenRow[]>([]);
export const outbox = signal<OutboxSummary | null>(null);
export const online = signal<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
export const syncPhase = signal<SyncPhase>("idle");
export const syncNote = signal<string>("");
export const lastSync = signal<string | null>(null);
export const conflicts = signal<{ field: string; values: unknown[]; devices: string[] }[]>([]);
export const toast = signal<{ id: number; text: string; tone: "good" | "warn" | "bad" } | null>(null);
export const tourStep = signal(0);
export const accountId = signal<string | null>(null);
export const liveState = signal<"off" | "live" | "offline">("off");
export const lastLiveEvent = signal<{ type: string; at: number } | null>(null);
export const selectedCareer = signal<string | null>(null);
export const selectedScheme = signal<string | null>(null);

export const packFresh = computed(() => {
  const current = pack.value;
  if (!current) return false;
  return Date.now() < Date.parse(`${current.expires_at}T23:59:59Z`);
});

export const pendingSync = computed(() => (outbox.value?.queued ?? 0) > 0);

let toastTimer: number | undefined;

export function notify(text: string, tone: "good" | "warn" | "bad" = "good"): void {
  toast.value = { id: Date.now(), text, tone };
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = null;
  }, 3800);
}

export function applyTheme(next: Theme): void {
  theme.value = next;
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#12111f" : "#f7f1e7");
  try {
    localStorage.setItem("sopaan_theme", next);
  } catch {
    // Private mode can refuse storage; the in-memory theme still applies.
  }
}

export async function setTheme(next: Theme): Promise<void> {
  applyTheme(next);
  await setSetting("theme", next);
}

export async function enterApp(path = "/"): Promise<void> {
  landingSeen.value = true;
  await setSetting("landing_seen", true);
  navigate(path);
}

export function navigate(path: string): void {
  if (window.location.hash !== `#${path}`) window.location.hash = path;
  route.value = path;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export async function refreshLocal(): Promise<void> {
  const currentRegistry = registry.value;
  profile.value = await loadProfile();
  wallet.value = await refreshWallet(currentRegistry);
  allowance.value = await getAllowance();
  tokens.value = await listTokens();
  outbox.value = await outboxSummary();
  lastSync.value = await lastSyncAt();
  conflicts.value = await getConflicts();
}

let realtimeHandle: RealtimeHandle | null = null;
let lastLiveToastAt = 0;

/** Open the account-scoped live stream. Safe to call repeatedly. */
export async function startLiveUpdates(): Promise<void> {
  realtimeHandle?.close();
  realtimeHandle = null;
  if (!getAuthToken()) {
    liveState.value = "off";
    return;
  }
  const base = await serverBase();
  realtimeHandle = connectRealtime(base, {
    onState: (state) => {
      liveState.value = state;
    },
    onFrame: (frame) => {
      lastLiveEvent.value = { type: frame.type, at: Date.now() };
      void refreshLocal();
      // One readable line per burst, not one per event.
      const now = Date.now();
      if (now - lastLiveToastAt < 4000) return;
      lastLiveToastAt = now;
      notify(
        lang.value === "hi"
          ? "इस खाते में नया अपडेट आया"
          : "New update on this account",
        "good",
      );
    },
  });
}

export function stopLiveUpdates(): void {
  realtimeHandle?.close();
  realtimeHandle = null;
  liveState.value = "off";
}

export async function bootstrap(): Promise<void> {
  try {
    // Every account gets its own local store, so signing in as someone else never shows
    // the previous learner's profile, wallet or outbox.
    const owner = getAuthUserId();
    await useAccount(owner);
    accountId.value = activeAccountKey();

    const id = await ensureIdentity();
    identity.value = id;
    const storedLang = await getSetting<Lang>("language", "hi");
    lang.value = storedLang;
    applyTheme(await getSetting<Theme>("theme", "dark"));
    landingSeen.value = await getSetting("landing_seen", false);

    const artifacts = await ensureArtifacts();
    pack.value = artifacts.pack;
    registry.value = artifacts.registry;

    await ensureRoster();
    await ensureAllowance();
    // Demo profile is opt-in. Real-time multi-user mode starts with empty profile.
    // Users can load demo via loadDemoLearner() if desired.
    await refreshLocal();
    online.value = navigator.onLine;
    ready.value = true;

    window.addEventListener("online", () => {
      online.value = true;
      void startLiveUpdates();
    });
    window.addEventListener("offline", () => {
      online.value = false;
      liveState.value = "offline";
    });

    await startLiveUpdates();
  } catch (error) {
    bootError.value = String(error);
    ready.value = true;
  }
}

export function setLanguage(next: Lang): void {
  lang.value = next;
  void setSetting("language", next);
}

export async function confirmProfileFields(fields: FieldConfirmation[]): Promise<void> {
  await confirmFields(fields);
  await refreshLocal();
  notify(t("common.save", lang.value), "good");
}

export async function loadDemoLearner(): Promise<void> {
  await seedDemoProfile();
  await refreshLocal();
  notify(
    lang.value === "hi" ? "राधा की डेमो प्रोफ़ाइल तैयार है" : "Radha's demo profile is ready",
    "good",
  );
}

export async function syncNow(options: { base?: string; silent?: boolean } = {}): Promise<boolean> {
  const base = options.base ?? (await serverBase());
  if (!navigator.onLine) {
    online.value = false;
    syncPhase.value = "offline";
    syncNote.value = t("common.offline", lang.value);
    if (!options.silent) notify(syncNote.value, "warn");
    return false;
  }
  syncPhase.value = "syncing";
  syncNote.value = t("common.syncing", lang.value);
  const result = await syncAll(base);
  syncPhase.value = result.ok ? "ok" : "offline";
  online.value = !result.offline;
  syncNote.value = result.message ?? (result.ok ? "ok" : "offline");

  if (result.pack) {
    const active = await getActivePack();
    if (active) pack.value = decodePayload(active.envelope);
  }
  if (result.registry) {
    const { getRegistry } = await import("./data/packs");
    registry.value = await getRegistry();
    wallet.value = await refreshWallet(registry.value);
  }
  outbox.value = result.outbox ?? (await outboxSummary());
  lastSync.value = await lastSyncAt();

  if (!options.silent) {
    if (result.ok) notify(result.acked > 0 ? `${result.acked} events acked` : "Up to date", "good");
    else notify(t("common.offline", lang.value), "warn");
  }
  return result.ok;
}

export async function installPackFile(text: string): Promise<boolean> {
  const result = await importPackText(text);
  if (!result.ok) {
    notify(`Update rejected: ${result.errors.join(", ")}`, "bad");
    return false;
  }
  if (!result.installed) {
    notify(
      result.reason === "older_version_rejected"
        ? `Older pack rejected — still on ${result.version}`
        : `Already on ${result.version}`,
      "warn",
    );
    return false;
  }
  const active = await getActivePack();
  if (active) pack.value = decodePayload(active.envelope);
  notify(`Pack ${result.version} verified and swapped in`, "good");
  return true;
}

export async function checkForUpdates(): Promise<void> {
  try {
    const result = await fetchLatestArtifacts();
    if (result.pack.installed) {
      const active = await getActivePack();
      if (active) pack.value = decodePayload(active.envelope);
      notify(`Pack ${result.pack.version} installed`, "good");
    } else {
      notify(result.pack.reason === "already_installed" ? "Already up to date" : result.pack.reason, "warn");
    }
    if (result.registry.installed) {
      const { getRegistry } = await import("./data/packs");
      registry.value = await getRegistry();
      wallet.value = await refreshWallet(registry.value);
    }
  } catch (error) {
    notify(`No newer signed pack reachable (${String(error)})`, "warn");
  }
}

export async function markTourStep(step: number): Promise<void> {
  tourStep.value = step;
  await setSetting("tour_step", step);
}

export async function restoreTourStep(): Promise<void> {
  tourStep.value = await getSetting("tour_step", 0);
}

export async function resetConsent(): Promise<void> {
  await setSetting("guardian_consent", false);
  await db.profile.clear();
  profile.value = await loadProfile();
  notify("Profile cleared", "warn");
}
