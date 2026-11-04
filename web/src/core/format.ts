// Display helpers. Freshness is its own vocabulary because "works offline" must never
// be presented as global truth (design D8).
export type FreshnessState = "fresh" | "cached" | "stale" | "verified_offline";

export interface Freshness {
  state: FreshnessState;
  label: string;
  detail: string;
  tone: "good" | "warn" | "bad" | "info";
}

export function freshness(options: {
  expiresAt?: string | null;
  syncedAt?: string | null;
  pendingSync?: boolean;
  registryAgeDays?: number | null;
  now?: number;
}): Freshness {
  const now = options.now ?? Date.now();

  if (options.registryAgeDays !== undefined && options.registryAgeDays !== null) {
    return {
      state: "verified_offline",
      label: "Verified offline",
      detail: `registry as of ${options.registryAgeDays} day${options.registryAgeDays === 1 ? "" : "s"} ago`,
      tone: options.registryAgeDays > 30 ? "warn" : "info",
    };
  }

  const expires = options.expiresAt ? Date.parse(`${options.expiresAt}T23:59:59Z`) : NaN;
  if (!Number.isNaN(expires) && now > expires) {
    return {
      state: "stale",
      label: "Stale",
      detail: `pack expired ${formatDate(options.expiresAt)}`,
      tone: "warn",
    };
  }
  if (options.pendingSync) {
    return {
      state: "cached",
      label: "Cached",
      detail: options.syncedAt ? `last sync ${formatDate(options.syncedAt)}` : "not synced yet",
      tone: "warn",
    };
  }
  return {
    state: "fresh",
    label: "Fresh",
    detail: options.syncedAt ? `synced ${formatDate(options.syncedAt)}` : "on this device",
    tone: "good",
  };
}

export function formatDate(value?: string | null, locale = "en-IN"): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | null, locale = "en-IN"): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRupees(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
