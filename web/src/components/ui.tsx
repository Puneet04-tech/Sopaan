import type { ComponentChildren, JSX } from "preact";
import { freshness, type Freshness } from "../core/format";
import { pendingSync, pack, setTheme, theme } from "../state";

const paths: Record<string, JSX.Element> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h5a5 5 0 0 0 0-10H8" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.7-1.4 1.8-2 3-2s2.3.6 3 2" /><path d="M15 10h3M15 14h3" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14-5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14 5l2-2" /><path d="M20 20v-4h-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>,
  check: <path d="m4.5 12.5 5 5L20 6.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  warn: <><path d="M12 3 2.5 20h19z" /><path d="M12 9v5M12 17.5v.5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.2 2.8-5 6-5s5.5 1.8 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 15.4c2 .7 3.2 2.3 3.5 4.6" /></>,
  shield: <><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6 6 2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2z" /><path d="M20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2z" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m5 9 7 7 7-7" />,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 3v5h-5" /></>,
  bell: <><path d="M6 16V10a6 6 0 0 1 12 0v6l2 2H4z" /><path d="M10 20h4" /></>,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3v12H4z" /><circle cx="12" cy="13" r="3.2" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  building: <><path d="M4 21V5l8-2v18" /><path d="M12 21h8V9l-8-2" /><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" /></>,
  heart: <path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z" />,
  steps: <><path d="M4 20h4v-4h4v-4h4V8h4" /><path d="M4 20V10M8 16V6" /></>,
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.spark}
    </svg>
  );
}

export function Badge({
  tone = "plain",
  children,
}: {
  tone?: "good" | "warn" | "bad" | "info" | "plum" | "plain";
  children: ComponentChildren;
}) {
  return <span class={`badge ${tone}`}>{children}</span>;
}

export function PageHead({
  kicker,
  title,
  sub,
  action,
}: {
  kicker: string;
  title: string;
  sub?: string;
  action?: ComponentChildren;
}) {
  return (
    <header class="page-head">
      <div class="row-between">
        <div>
          <div class="eyebrow">{kicker}</div>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {sub ? <p class="lede">{sub}</p> : null}
    </header>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
}) {
  if (!open) return null;
  return (
    <div class="sheet-backdrop" onClick={onClose} role="presentation">
      <div class="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-handle" />
        <div class="row-between" style="margin-bottom:12px">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stairway({ filled, total = 5 }: { filled: number; total?: number }) {
  return (
    <div class="stairs" aria-label={`${filled} of ${total} steps`}>
      {Array.from({ length: total }, (_, index) => {
        const height = 26 + index * 5;
        const className = index < filled ? "done" : index === filled ? "now" : "";
        return <span class={className} style={`height:${height}px`} key={index} />;
      })}
    </div>
  );
}

export function FreshnessChip() {
  const current = pack.value;
  const state = freshness({
    expiresAt: current?.expires_at,
    pendingSync: pendingSync.value,
  });
  const tone = state.tone === "good" ? "good" : state.tone === "warn" ? "warn" : "info";
  return (
    <Badge tone={tone}>
      <Icon name={state.state === "fresh" ? "check" : "warn"} size={12} />
      {state.label}
    </Badge>
  );
}

export function FreshBadge({ value }: { value: Freshness }) {
  const tone = value.tone === "good" ? "good" : value.tone === "warn" ? "warn" : "info";
  return <Badge tone={tone}>{value.label}</Badge>;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const current = theme.value;
  const next = current === "dark" ? "light" : "dark";
  return (
    <button
      class={`icon-btn theme-toggle ${compact ? "compact" : ""}`}
      onClick={() => void setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      aria-pressed={current === "dark"}
    >
      <Icon name={current === "dark" ? "sun" : "moon"} size={17} />
    </button>
  );
}

export function Empty({ text, icon = "spark" }: { text: string; icon?: string }) {
  return (
    <div class="card flat center" style="padding:26px 18px">
      <div style="width:46px;height:46px;border-radius:14px;background:var(--paper-2);display:grid;place-items:center;margin:0 auto 10px">
        <Icon name={icon} size={22} />
      </div>
      <p class="muted">{text}</p>
    </div>
  );
}

export function Meter({ value }: { value: number }) {
  return (
    <div class="meter" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={`width:${Math.max(2, Math.min(100, value * 100))}%`} />
    </div>
  );
}

export function SourceCite({
  schemeId,
  rule,
  packVersion,
  source,
  verified,
}: {
  schemeId: string;
  rule?: string | null;
  packVersion: string;
  source: string;
  verified: string;
}) {
  return (
    <div class="cite">
      <span class="rule">
        {schemeId}
        {rule ? ` · ${rule}` : ""}
      </span>
      <span>
        pack {packVersion} · verified {verified}
      </span>
      <span style="overflow-wrap:anywhere">{source}</span>
    </div>
  );
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
