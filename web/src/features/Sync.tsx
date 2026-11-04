import { useEffect, useState } from "preact/hooks";
import { formatDate, formatDateTime } from "../core/format";
import { installedPacks, rollbackPack } from "../data/packs";
import { setSetting, type EventRow, type PackRow } from "../data/db";
import { recentEvents } from "../data/outbox";
import { serverBase } from "../data/sync";
import {
  checkForUpdates,
  conflicts,
  installPackFile,
  lang,
  lastSync,
  notify,
  outbox,
  pack,
  refreshLocal,
  registry,
  syncNow,
  syncNote,
  syncPhase,
} from "../state";
import { Badge, Icon, PageHead } from "../components/ui";

export function SyncPage() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [url, setUrl] = useState("http://localhost:8080");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void serverBase().then(setUrl);
    void recentEvents(14).then(setEvents);
    void installedPacks().then(setPacks);
  }, []);

  async function reload() {
    setEvents(await recentEvents(14));
    setPacks(await installedPacks());
    await refreshLocal();
  }

  async function runSync() {
    setBusy(true);
    await syncNow({ base: url });
    setBusy(false);
    await reload();
  }

  async function loadPack(path: string) {
    setBusy(true);
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      await installPackFile(text);
      await reload();
    } catch (exception) {
      notify(`Could not load ${path}: ${String(exception)}`, "bad");
    }
    setBusy(false);
  }

  const status = syncPhase.value;
  const statusTone = status === "ok" ? "good" : status === "offline" || status === "error" ? "warn" : "plain";

  return (
    <div class="screen">
      <PageHead
        kicker={L("सिंक और पैक", "Sync and packs")}
        title={L("नेटवर्क जब मिले, तब", "Sync when the network allows")}
        sub={L(
          "इवेंट ऊपर जाते हैं, हस्ताक्षरित पैक नीचे आते हैं। नेटवर्क न हो तो कोई काम नहीं रुकता।",
          "Events go up, signed packs come down. No network never blocks a user action.",
        )}
        action={<Badge tone={statusTone}>{status}</Badge>}
      />

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("क्लाउड सर्वर", "Cloud server")}</h3>
          <Badge tone={lastSync.value ? "info" : "plain"}>
            {lastSync.value ? `${L("अंतिम", "Last")} ${formatDateTime(lastSync.value)}` : L("कभी नहीं", "Never")}
          </Badge>
        </div>
        <div class="field mt-2">
          <label for="server-url">{L("पता", "Base URL")}</label>
          <input
            id="server-url"
            class="input"
            value={url}
            onInput={(event) => setUrl((event.target as HTMLInputElement).value)}
            onBlur={() => void setSetting("server_url", url)}
          />
        </div>
        <div class="btn-row mt-3">
          <button class="btn secondary" disabled={busy} onClick={runSync}>
            <Icon name="sync" size={16} />
            {busy ? L("सिंक…", "Syncing…") : L("अभी सिंक करें", "Sync now")}
          </button>
          <button class="btn secondary" onClick={() => void checkForUpdates()}>
            <Icon name="down" size={16} />
            {L("नया पैक", "New pack")}
          </button>
        </div>
        {syncNote.value ? <p class="tiny muted mt-2">{syncNote.value}</p> : null}
      </section>

      <div class="metric-grid" style="margin-bottom:12px">
        <div class="metric">
          <div class="value">{outbox.value?.queued ?? 0}</div>
          <div class="label">{L("कतार", "Queued")}</div>
        </div>
        <div class="metric">
          <div class="value">{outbox.value?.acked ?? 0}</div>
          <div class="label">{L("स्वीकृत", "Acked")}</div>
        </div>
        <div class="metric">
          <div class="value">{outbox.value?.rejected ?? 0}</div>
          <div class="label">{L("अस्वीकृत", "Rejected")}</div>
        </div>
      </div>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("सक्रिय पैक", "Active pack")}</h3>
          <Badge tone="plain">{pack.value?.version ?? "—"}</Badge>
        </div>
        <dl class="kv mt-2">
          <dt>{L("समाप्ति", "Expires")}</dt>
          <dd>{formatDate(pack.value?.expires_at)}</dd>
          <dt>{L("समीक्षक", "Reviewers")}</dt>
          <dd>{pack.value?.reviewers.length ?? 0} / 3</dd>
          <dt>{L("रजिस्ट्री", "Registry")}</dt>
          <dd>{registry.value ? `${registry.value.version} · ${formatDate(registry.value.synced_at)}` : "—"}</dd>
        </dl>
        <div class="divider" />
        <h4 style="font-size:0.85rem">{L("स्थापित संस्करण", "Installed versions")}</h4>
        <div class="stack mt-2">
          {packs.map((row) => (
            <div class="row-between tiny" key={`${row.name}@${row.version}`}>
              <span>
                {row.version} {row.active ? <Badge tone="good">{L("सक्रिय", "active")}</Badge> : null}
              </span>
              {!row.active ? (
                <button
                  class="link-btn"
                  onClick={async () => {
                    await rollbackPack(row.version);
                    await refreshLocal();
                    setPacks(await installedPacks());
                    notify(`Rolled back to ${row.version}`, "warn");
                  }}
                >
                  {L("वापस लाएँ", "Roll back")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <h3>{L("WhatsApp जैसा फ़ाइल चैनल", "A WhatsApp-like file channel")}</h3>
        <p class="muted tiny mt-2">
          {L(
            "चैनल पर भरोसा नहीं — सिर्फ़ हस्ताक्षर और संस्करण देखे जाते हैं। पुराना पैक अस्वीकार होता है।",
            "The channel is untrusted; only the signature and version decide. An older pack is refused.",
          )}
        </p>
        <div class="btn-row mt-3">
          <button class="btn secondary small" disabled={busy} onClick={() => loadPack("/packs/schemes-mh/2026.11.20-1.json")}>
            {L("नया पैक लाएँ", "Load newer pack")}
          </button>
          <button class="btn secondary small" disabled={busy} onClick={() => loadPack("/packs/schemes-mh/2026.09.01-1.json")}>
            {L("पुराना पैक", "Load older pack")}
          </button>
        </div>
        <label class="btn secondary small mt-2" style="display:inline-flex;cursor:pointer">
          <Icon name="file" size={15} />
          {L("अपनी फ़ाइल चुनें", "Choose a file")}
          <input
            type="file"
            accept="application/json,.json"
            style="display:none"
            onChange={async (event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const text = await file.text();
              await installPackFile(text);
              await reload();
            }}
          />
        </label>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("इवेंट लॉग", "Event log")}</h3>
          <span class="tiny muted">{L("नया पहले", "newest first")}</span>
        </div>
        {events.length === 0 ? (
          <p class="muted mt-2">{L("कोई इवेंट नहीं।", "No events yet.")}</p>
        ) : (
          <table class="simple mt-2">
            <thead>
              <tr>
                <th>#</th>
                <th>{L("प्रकार", "Type")}</th>
                <th>{L("स्थिति", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.eventId}>
                  <td>{event.seq}</td>
                  <td>{event.type}</td>
                  <td>
                    <Badge tone={event.status === "ACKED" ? "good" : event.status === "QUEUED" ? "warn" : event.status === "REJECTED" ? "bad" : "plain"}>
                      {event.status.toLowerCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="tiny muted mt-2">
          {L("बैच सीमा 200 इवेंट। acked_upto के नीचे के सेगमेंट एक साथ हटते हैं।", "Batches cap at 200 events. Segments below acked_upto are dropped as a unit.")}
        </p>
      </section>

      {conflicts.value.length > 0 ? (
        <section class="card" style="margin-bottom:12px">
          <h3>{L("टकराव", "Conflicts")}</h3>
          {conflicts.value.map((conflict) => (
            <div class="callout mt-2" key={conflict.field}>
              {conflict.field}: {conflict.values.map((value) => String(value)).join(" / ")}
            </div>
          ))}
        </section>
      ) : null}

      <p class="tiny muted center">
        {L(
          "नेटवर्क न हो तो कतार में रुकता है; डुप्लीकेट इवेंट फिर भी सफल माना जाता है।",
          "Without a network the queue waits; a duplicate event is still treated as success.",
        )}
      </p>
    </div>
  );
}
