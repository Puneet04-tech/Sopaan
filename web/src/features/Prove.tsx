import { useState } from "preact/hooks";
import QRCode from "qrcode";
import { formatDate } from "../core/format";
import { verifyCredential } from "../core/verify";
import { lang, navigate, registry, wallet } from "../state";
import type { CredentialRow } from "../data/db";
import { Badge, Icon, Modal, PageHead } from "../components/ui";

export function Prove() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [selected, setSelected] = useState<CredentialRow | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  async function openCredential(row: CredentialRow) {
    setSelected(row);
    setQr(null);
    const dataUrl = await QRCode.toDataURL(JSON.stringify(row.envelope), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#191833", light: "#ffffff" },
    });
    setQr(dataUrl);
  }

  const check = selected ? verifyCredential(selected.envelope, registry.value) : null;

  return (
    <div class="screen">
      <PageHead
        kicker={L("स्किल पासपोर्ट", "Skill Passport")}
        title={L("जो आपने सीखा, प्रमाणित", "What you learned, signed")}
        sub={L(
          "हर प्रमाण एक Ed25519 हस्ताक्षर है। QR बिना नेटवर्क जाँचा जा सकता है; रजिस्ट्री की तारीख हमेशा दिखती है।",
          "Each credential is an Ed25519 signature. A QR verifies with no network; registry age is always shown.",
        )}
        action={<Badge tone={wallet.value.length > 0 ? "good" : "plain"}>{wallet.value.length}</Badge>}
      />

      {wallet.value.length === 0 ? (
        <section class="card flat center" style="padding:26px 18px;margin-bottom:14px">
          <div style="width:48px;height:48px;border-radius:14px;background:var(--plum-soft);color:var(--plum);display:grid;place-items:center;margin:0 auto 10px">
            <Icon name="id" size={22} />
          </div>
          <h3>{L("अभी कोई प्रमाण नहीं", "No credentials yet")}</h3>
          <p class="muted mt-2">
            {L(
              "सुविधाकर्ता मूल्यांकन के बाद प्रमाण जारी करता है। डेमो में हब खोलकर खुद जारी करें।",
              "A facilitator issues a credential after an assessment. In the demo, open the hub and issue one.",
            )}
          </p>
          <button class="btn mt-3" onClick={() => navigate("/hub")}>{L("हब खोलें", "Open the hub")}</button>
        </section>
      ) : (
        <div class="stack">
          {wallet.value.map((row) => (
            <button class="card buttonlike" key={row.credId} onClick={() => openCredential(row)}>
              <div class="row-between">
                <span class="card-kicker">{L("कौशल", "Skill")}</span>
                <Badge tone={row.status === "VALID" ? "good" : row.status === "POSSIBLY_REVOKED" ? "warn" : "bad"}>
                  {row.status === "VALID" ? L("वैध", "Valid") : row.status === "POSSIBLY_REVOKED" ? L("जाँचें", "Check online") : L("अमान्य", "Invalid")}
                </Badge>
              </div>
              <h3 style="margin-top:6px">{row.skill.replace(".", " · ")}</h3>
              <p class="tiny muted mt-2">
                {L("जारी", "Issued")} {formatDate(new Date(row.issuedAt * 1000).toISOString())} ·{" "}
                {L("मान्य", "valid to")} {formatDate(new Date(row.expiry * 1000).toISOString())}
              </p>
              <div class="row-between mt-2">
                <span class="tiny muted">{row.issuerKid}</span>
                <span class="row tiny" style="color:var(--plum);font-weight:800">
                  {L("QR देखें", "Show QR")} <Icon name="qr" size={15} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div class="btn-row mt-3">
        <button class="btn secondary" onClick={() => navigate("/verify")}>
          <Icon name="qr" size={16} />
          {L("दूसरा प्रमाण जाँचें", "Verify another")}
        </button>
        <button class="btn" onClick={() => navigate("/hub")}>
          <Icon name="plus" size={16} />
          {L("प्रमाण जारी करें", "Issue one")}
        </button>
      </div>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.skill ?? ""}>
        {selected ? (
          <>
            <div class="qr-wrap">
              {qr ? <img src={qr} alt={`QR for ${selected.skill}`} /> : <div class="qr-placeholder">{L("QR बन रहा है…", "Building QR…")}</div>}
            </div>
            <div class="stack mt-3">
              <div class="row-between">
                <span class="muted tiny">{L("स्थिति", "Status")}</span>
                <Badge tone={check?.status === "VALID" ? "good" : "bad"}>{check?.status ?? selected.status}</Badge>
              </div>
              <div class="row-between">
                <span class="muted tiny">{L("जारीकर्ता", "Issuer")}</span>
                <span class="tiny">{check?.issuer?.org ?? selected.issuerKid}</span>
              </div>
              <div class="row-between">
                <span class="muted tiny">{L("रजिस्ट्री", "Registry")}</span>
                <span class="tiny">
                  {check?.registryAgeDays !== null && check?.registryAgeDays !== undefined
                    ? `${check.registryAgeDays} ${L("दिन पुरानी", "days old")}`
                    : "—"}
                </span>
              </div>
              <div class="row-between">
                <span class="muted tiny">{L("प्रमाण हैश", "Evidence hash")}</span>
                <span class="sig">{selected.envelope.payload ? JSON.parse(atob(selected.envelope.payload.replace(/-/g, "+").replace(/_/g, "/"))).ev?.slice(0, 16) : ""}…</span>
              </div>
            </div>
            <div class="callout mt-3">
              {L(
                "हस्ताक्षर यह साबित करता है कि किसने जारी किया और कुछ बदला नहीं गया। यह मूल्यांकन की निष्पक्षता नहीं साबित करता।",
                "A signature proves who issued it and that nothing changed. It does not prove the assessment was fair.",
              )}
            </div>
            <button class="btn secondary mt-3" onClick={() => navigate("/verify")}>
              {L("सत्यापनकर्ता की तरह जाँचें", "Verify like a third party")}
            </button>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
