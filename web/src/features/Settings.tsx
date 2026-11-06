import { useEffect, useState } from "preact/hooks";
import { db, ensureIdentity, getSetting, resetLocalData, setSetting, type DeviceIdentity, type PackRow } from "../data/db";
import { installedPacks, rollbackPack, BUNDLED_PACK } from "../data/packs";
import { verifyPack } from "../core/envelope";
import { formatDate } from "../core/format";
import { refreshLocal, lang, setLanguage, notify, setTheme, theme, accountId, liveState, stopLiveUpdates } from "../state";
import { getAuthName, getAuthRole, logout } from "../data/auth";
import { CONSENT_VERSION, saveConsent } from "../data/consent";
import { api, describeError } from "../data/api";
import { canAdmin } from "../data/roles";
import { Badge, Icon, PageHead } from "../components/ui";

export function Settings() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [consent, setConsent] = useState({ guardian: false, cloudSpeech: false, counters: true });
  const [measured, setMeasured] = useState<{ bundleKb: number; verifyMs: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [consentOnServer, setConsentOnServer] = useState(false);
  const [grantUser, setGrantUser] = useState("");
  const [grantRoleValue, setGrantRoleValue] = useState("FACILITATOR");

  useEffect(() => {
    void ensureIdentity().then(setIdentity);
    void installedPacks().then(setPacks);
    void Promise.all([
      getSetting("guardian_consent", false),
      getSetting("cloud_speech", false),
      getSetting("aggregate_counters", true),
    ]).then(([guardian, cloudSpeech, counters]) => setConsent({ guardian, cloudSpeech, counters }));
    void getSetting("consent_on_server", false).then(setConsentOnServer);

    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const bytes = resources
      .filter((entry) => /\.(js|css)$/.test(new URL(entry.name).pathname))
      .reduce((sum, entry) => sum + (entry.encodedBodySize || entry.transferSize || 0), 0);
    const start = performance.now();
    for (let index = 0; index < 5; index += 1) verifyPack(BUNDLED_PACK);
    const verifyMs = (performance.now() - start) / 5;
    setMeasured({ bundleKb: Math.round(bytes / 1024), verifyMs: Math.round(verifyMs * 10) / 10 });
  }, []);

  async function toggle(key: "guardian" | "cloudSpeech" | "counters", value: boolean) {
    setConsent((current) => ({ ...current, [key]: value }));
    await setSetting(key === "guardian" ? "guardian_consent" : key === "cloudSpeech" ? "cloud_speech" : "aggregate_counters", value);
    // Consent is server-authoritative: mirror the change upward and show whether it landed.
    const pushed = await saveConsent({
      guardian: key === "guardian" ? value : consent.guardian,
      cloudSpeech: key === "cloudSpeech" ? value : consent.cloudSpeech,
      aggregateCounters: key === "counters" ? value : consent.counters,
      version: CONSENT_VERSION,
      onServer: false,
      pushedAt: null,
    });
    setConsentOnServer(pushed.onServer);
    if (pushed.onServer) notify(L("सहमति सर्वर पर दर्ज", "Consent recorded on the server"), "good");
    else notify(L("सहमति इस फ़ोन पर रुकी — नेटवर्क पर जाएँ", "Consent is queued here until the network returns"), "warn");
  }

  async function grantRole(target: string, role: string) {
    try {
      await api(`/v1/admin/users/${encodeURIComponent(target)}:grant-role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      notify(L("भूमिका दी गई — दोबारा साइन इन पर लागू", "Role granted — effective at the next sign-in"), "good");
    } catch (problem) {
      notify(describeError(problem), "warn");
    }
  }

  return (
    <div class="screen">
      <PageHead
        kicker={L("सेटिंग्स", "Settings")}
        title={L("आपका डेटा, आपका नियंत्रण", "Your data, your control")}
        sub={L(
          "छद्म पहचान, संस्करणबद्ध सहमति, और हर नतीजे पर उसकी उम्र।",
          "Pseudonymous identity, versioned consent, and an age on every result.",
        )}
      />

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("खाता", "Account")}</h3>
          <Badge tone={liveState.value === "live" ? "good" : liveState.value === "offline" ? "warn" : "plain"}>
            {liveState.value === "live" ? L("लाइव", "live") : liveState.value === "offline" ? L("फिर जुड़ेगा", "reconnecting") : L("बंद", "off")}
          </Badge>
        </div>
        {accountId.value ? (
          <>
            <dl class="kv mt-2">
              <dt>{L("उपयोगकर्ता नाम", "Username")}</dt>
              <dd>{getAuthName() ?? "—"}</dd>
              <dt>{L("भूमिका", "Role")}</dt>
              <dd>{getAuthRole() ?? "STUDENT"}</dd>
              <dt>{L("खाता आईडी", "Account id")}</dt>
              <dd class="sig">{accountId.value}</dd>
            </dl>
            <p class="tiny muted mt-2">
              {L(
                "इस खाते का डेटा इस फ़ोन पर अलग रखा जाता है — दूसरा खाता इसे नहीं देख सकता।",
                "This account's data is stored separately on this phone; another account cannot read it.",
              )}
            </p>
            <button
              class="btn secondary mt-3"
              onClick={() => {
                stopLiveUpdates();
                logout();
                window.location.hash = "#/";
                window.location.reload();
              }}
            >
              {L("साइन आउट", "Sign out")}
            </button>
          </>
        ) : (
          <>
            <p class="muted tiny mt-2">
              {L("आप बिना खाते के चल रहे हैं। सिंक और लाइव अपडेट के लिए साइन इन करें।", "You are using Sopaan without an account. Sign in for sync and live updates.")}
            </p>
            <div class="btn-row mt-3">
              <a class="btn saffron small" href="#/login">{L("लॉगिन", "Login")}</a>
              <a class="btn secondary small" href="#/register">{L("साइन अप", "Sign up")}</a>
            </div>
          </>
        )}
      </section>

      <section class="card" style="margin-bottom:12px">
        <h3>{L("रूप", "Appearance")}</h3>
        <div class="segmented mt-2">
          <button aria-pressed={theme.value === "dark"} onClick={() => void setTheme("dark")}>
            {L("रात", "Night")}
          </button>
          <button aria-pressed={theme.value === "light"} onClick={() => void setTheme("light")}>
            {L("दिन", "Daylight")}
          </button>
        </div>
        <p class="tiny muted mt-2">
          {L(
            "रात डिफ़ॉल्ट है; चुनाव इस फ़ोन पर याद रहता है।",
            "Night is the default; the choice is remembered on this phone.",
          )}
        </p>
      </section>

      <section class="card" style="margin-bottom:12px">
        <h3>{L("भाषा", "Language")}</h3>
        <div class="segmented mt-2">
          {([["hi", "हिंदी"], ["mr", "मराठी"], ["en", "English"]] as const).map(([id, label]) => (
            <button key={id} aria-pressed={language === id} onClick={() => setLanguage(id)}>{label}</button>
          ))}
        </div>
        <p class="tiny muted mt-2">
          {L("नई भाषा एक हस्ताक्षरित पैक है, ऐप अपडेट नहीं।", "A new language is a signed pack, not an app release.")}
        </p>
      </section>

      <section class="card" style="margin-bottom:12px">
        <h3>{L("सहमति", "Consent")}</h3>
        <label class="row-between mt-2">
          <span class="tiny">{L("अभिभावक की सहमति (18 से कम उम्र)", "Guardian consent (under 18)")}</span>
          <input type="checkbox" checked={consent.guardian} onChange={(event) => toggle("guardian", (event.target as HTMLInputElement).checked)} />
        </label>
        <label class="row-between mt-2">
          <span class="tiny">{L("क्लाउड वाक् पहचान की अनुमति", "Allow cloud speech recognition")}</span>
          <input type="checkbox" checked={consent.cloudSpeech} onChange={(event) => toggle("cloudSpeech", (event.target as HTMLInputElement).checked)} />
        </label>
        <label class="row-between mt-2">
          <span class="tiny">{L("समूह उपयोग आँकड़े साझा करें", "Share aggregate usage counters")}</span>
          <input type="checkbox" checked={consent.counters} onChange={(event) => toggle("counters", (event.target as HTMLInputElement).checked)} />
        </label>
        <div class="callout mt-3">
          {L(
            "अनुमति संस्करण consent-2026-10 है और सर्वर पर दर्ज होती है। रॉ ऑडियो डिफ़ॉल्ट रूप से डिवाइस नहीं छोड़ता; कोई आधार संख्या नहीं मांगी जाती।",
            "Consent is versioned (consent-2026-10) and recorded on the server. Raw audio does not leave the device by default; no Aadhaar number is collected.",
          )}
        </div>
        <p class="tiny muted mt-2">
          {consentOnServer
            ? L("सर्वर पर दर्ज", "recorded on the server")
            : L("इस फ़ोन पर लंबित", "pending on this phone")}
        </p>
      </section>

      {canAdmin() && (
        <section class="card" style="margin-bottom:12px">
          <div class="row-between">
            <h3>{L("भूमिकाएँ", "Roles")}</h3>
            <Badge tone="plum">{L("प्रशासक", "admin")}</Badge>
          </div>
          <p class="tiny muted mt-1">
            {L(
              "भूमिका केवल प्रशासक देता है; हर बदलाव हैश-चेन ऑडिट में जाता है।",
              "Only an administrator grants a role; every change goes to the hash-chained audit log.",
            )}
          </p>
          <div class="stack mt-2">
            <div class="field">
              <label>{L("उपयोगकर्ता नाम", "Username")}</label>
              <input class="input" value={grantUser} onInput={(event) => setGrantUser((event.target as HTMLInputElement).value)} placeholder="username" />
            </div>
            <div class="field">
              <label>{L("भूमिका", "Role")}</label>
              <select class="select" value={grantRoleValue} onChange={(event) => setGrantRoleValue((event.target as HTMLSelectElement).value)}>
                {["STUDENT", "FACILITATOR", "REVIEWER", "SPONSOR", "ADMIN"].map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
          </div>
          <button class="btn secondary small mt-2" onClick={() => grantRole(grantUser.trim(), grantRoleValue)} disabled={!grantUser.trim()}>
            {L("भूमिका दें", "Grant role")}
          </button>
        </section>
      )}

      <section class="card" style="margin-bottom:12px">
        <h3>{L("डिवाइस पहचान", "Device identity")}</h3>
        <dl class="kv mt-2">
          <dt>Device</dt>
          <dd class="sig">{identity?.deviceId ?? "—"}</dd>
          <dt>Student</dt>
          <dd class="sig">{identity?.studentId ?? "—"}</dd>
          <dt>Key</dt>
          <dd class="sig">{identity?.kid ?? "—"}</dd>
          <dt>Public key</dt>
          <dd class="sig">{identity?.publicKey.slice(0, 32)}…</dd>
        </dl>
        <p class="tiny muted mt-2">
          {L(
            "निजी कुंजी इस फ़ोन पर रहती है। पिन से लपेटने की सुविधा उपलब्ध है (PBKDF2, 2,10,000 पुनरावृत्ति)।",
            "The private key stays on this phone. PIN wrapping is available (PBKDF2, 210,000 iterations).",
          )}
        </p>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("इस फ़ोन पर मापा", "Measured on this phone")}</h3>
          <Badge tone="info">{L("ताज़ा माप", "live")}</Badge>
        </div>
        <div class="metric-grid mt-2">
          <div class="metric">
            <div class="value">{measured ? `${measured.bundleKb}` : "—"} KB</div>
            <div class="label">{L("JS+CSS", "JS+CSS")}</div>
          </div>
          <div class="metric">
            <div class="value">{measured ? measured.verifyMs : "—"} ms</div>
            <div class="label">{L("पैक जाँच", "pack verify")}</div>
          </div>
          <div class="metric">
            <div class="value">{formatDate(new Date().toISOString())}</div>
            <div class="label">{L("आज", "today")}</div>
          </div>
        </div>
        <p class="tiny muted mt-2">
          {L(
            "डिज़ाइन के लक्ष्य: शेल ≤ 2 MB gzipped, क्रेडेंशियल जाँच < 200 ms, क्रेडेंशियल ≤ 1,000 बाइट। ये मापे गए नतीजे नहीं, लक्ष्य हैं।",
            "Design targets: shell ≤ 2 MB gzipped, offline verify < 200 ms, credential ≤ 1,000 bytes. These are targets, not published results.",
          )}
        </p>
      </section>

      <section class="card" style="margin-bottom:12px">
        <h3>{L("स्थापित पैक", "Installed packs")}</h3>
        <div class="stack mt-2">
          {packs.map((row) => (
            <div class="row-between" key={`${row.name}@${row.version}`}>
              <span class="tiny">
                {row.version} {row.active ? <Badge tone="good">{L("सक्रिय", "active")}</Badge> : null}
              </span>
              {!row.active ? (
                <button
                  class="link-btn"
                  onClick={async () => {
                    await rollbackPack(row.version);
                    await refreshLocal();
                    setPacks(await installedPacks());
                    notify(`Active pack: ${row.version}`, "warn");
                  }}
                >
                  {L("सक्रिय करें", "Activate")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <h3>{L("ईमानदार सीमाएँ", "Honest limits")}</h3>
        <ul class="muted tiny mt-2" style="padding-left:18px;display:grid;gap:6px">
          <li>{L("Vosk हिंदी मॉडल बंडल नहीं है; आइकन हमेशा उपलब्ध हैं।", "The Vosk Hindi model is not bundled; icons are always available.")}</li>
          <li>{L("क्रेडिट सिम्युलेटेड हैं, नकद नहीं।", "Credits are simulated, not cash.")}</li>
          <li>{L("डेमो कुंजियाँ सार्वजनिक हैं और असली उपयोग के लिए नहीं हैं।", "Demo keys are published and must not be used in production.")}</li>
          <li>{L("नियमों को असली आवेदन से पहले दोबारा जाँचें।", "Re-verify scheme rules before any real application.")}</li>
          <li>{L("LAN हब सिंक एक स्ट्रेच लक्ष्य है (HTTPS चाहिए)।", "LAN hub sync is a stretch goal because it needs trusted HTTPS.")}</li>
        </ul>
      </section>

      <section class="card">
        <h3>{L("डेटा हटाएँ", "Delete local data")}</h3>
        <p class="muted tiny mt-2">
          {L("इस फ़ोन से प्रोफ़ाइल, इवेंट, प्रमाण और क्रेडिट हट जाएँगे।", "Profile, events, credentials and credits on this phone will be removed.")}
        </p>
        {confirmReset ? (
          <div class="btn-row mt-3">
            <button class="btn secondary" onClick={() => setConfirmReset(false)}>{L("रहने दें", "Keep")}</button>
            <button class="btn danger" onClick={() => void resetLocalData()}>{L("पक्का हटाएँ", "Delete now")}</button>
          </div>
        ) : (
          <button class="btn secondary mt-3" onClick={() => setConfirmReset(true)}>
            <Icon name="x" size={16} />
            {L("डेटा हटाएँ", "Delete data")}
          </button>
        )}
        <p class="tiny muted mt-3">
          {L(
            "कुल लोकल रिकॉर्ड: ",
            "Local records: ",
          )}
          {db.tables.length} {L("तालिकाएँ", "tables")}
        </p>
      </section>
    </div>
  );
}
