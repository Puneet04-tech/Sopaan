import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";
import { lang, navigate, online, outbox, route, setLanguage, toast } from "../state";
import { t, type Lang } from "../i18n";
import { Icon } from "./ui";

const NAV = [
  { path: "/", icon: "home", key: "nav.home" },
  { path: "/discover", icon: "compass", key: "nav.discover" },
  { path: "/plan", icon: "route", key: "nav.plan" },
  { path: "/prove", icon: "id", key: "nav.prove" },
  { path: "/more", icon: "settings", key: "nav.more" },
];

const LANGS: { id: Lang; label: string }[] = [
  { id: "hi", label: "हि" },
  { id: "mr", label: "मरा" },
  { id: "en", label: "En" },
];

function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="15" width="5" height="6" rx="1.4" fill="#f2a71b" />
      <rect x="10" y="10" width="5" height="11" rx="1.4" fill="#e9661f" />
      <rect x="17" y="5" width="5" height="16" rx="1.4" fill="#fff8ea" />
    </svg>
  );
}

function isActive(path: string): boolean {
  if (path === "/") return route.value === "/" || route.value === "";
  return route.value.startsWith(path);
}

export function Layout({ children }: { children: ComponentChildren }) {
  const language = lang.value;
  const pending = outbox.value?.queued ?? 0;
  const networkLabel = online.value ? t("common.online", language) : t("common.offline", language);

  const nav = useMemo(() => NAV, []);

  return (
    <>
      <div class="topbar">
        <a
          class="brand"
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            navigate("/");
          }}
        >
          <span class="brand-mark">
            <BrandMark />
          </span>
          <span>
            <span class="brand-name">SOPAAN</span>
            <span class="brand-tag">Every step, signed</span>
          </span>
        </a>
        <span class="topbar-spacer" />
        <span class={`net-pill ${online.value ? "" : "offline"}`} title={networkLabel}>
          <span class="dot" />
          {networkLabel}
          {pending > 0 ? ` · ${pending}` : ""}
        </span>
        <div class="lang-switch" role="group" aria-label={t("common.language", language)}>
          {LANGS.map((entry) => (
            <button
              key={entry.id}
              aria-pressed={language === entry.id}
              onClick={() => setLanguage(entry.id)}
              title={entry.id}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {!online.value && pending > 0 ? (
        <div class="callout" style="margin: 0 2px 12px; display:flex; gap:8px; align-items:center">
          <Icon name="warn" size={16} />
          <span>
            {language === "hi"
              ? `${pending} काम फ़ोन में सुरक्षित हैं। नेटवर्क मिलने पर सिंक होंगे।`
              : `${pending} action${pending === 1 ? "" : "s"} saved on this phone. They sync when the network returns.`}
          </span>
        </div>
      ) : null}

      <main>{children}</main>

      <nav class="bottom-nav" aria-label="Main">
        <div class="inner">
          {nav.map((item) => (
            <a
              key={item.path}
              class={`nav-item ${isActive(item.path) ? "active" : ""}`}
              href={`#${item.path}`}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.path);
              }}
              aria-current={isActive(item.path) ? "page" : undefined}
            >
              <Icon name={item.icon} size={20} />
              <span class="nav-label-hi">{t(item.key, language)}</span>
            </a>
          ))}
        </div>
      </nav>

      {toast.value ? <div class={`toast ${toast.value.tone}`}>{toast.value.text}</div> : null}
    </>
  );
}
