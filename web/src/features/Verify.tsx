import { useEffect, useRef, useState } from "preact/hooks";
import jsQR from "jsqr";
import demoKeys from "../generated/demo-keys.json";
import { signEnvelope, type CredentialPayload, type Envelope } from "../core/envelope";
import { verifyCredential, registryAgeDays, type VerifyResult } from "../core/verify";
import { formatDate } from "../core/format";
import { lang, registry, wallet } from "../state";
import { Badge, Icon, PageHead } from "../components/ui";

interface DemoKeys {
  issuer: { kid: string; publicKey: string; privateKey: string; epoch: number; scope: string[] };
}

const ISSUER = (demoKeys as unknown as DemoKeys).issuer;

export function Verify() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [text, setText] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [staleRegistry, setStaleRegistry] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let frame = 0;
    const canvas = document.createElement("canvas");
    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height);
          if (code?.data) {
            handleText(code.data);
            stopCamera();
            return;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [scanning]);

  function effectiveRegistry() {
    const current = registry.value;
    if (!current || !staleRegistry) return current;
    return {
      ...current,
      synced_at: new Date(Date.now() - 45 * 86_400_000).toISOString(),
    };
  }

  function handleText(value: string) {
    setError(null);
    try {
      const envelope = JSON.parse(value) as Envelope;
      if (envelope.typ !== "cred") throw new Error("not_a_credential");
      setResult(verifyCredential(envelope, effectiveRegistry()));
    } catch (exception) {
      setResult(null);
      setError(L("यह मान्य प्रमाण फ़ाइल नहीं है।", "That is not a credential envelope.") + ` (${String(exception)})`);
    }
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 30);
    } catch {
      setError(L("कैमरा उपलब्ध नहीं है। फ़ाइल या पाठ से जाँचें।", "Camera unavailable. Verify from a file or pasted text."));
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function decodeFile(file: File) {
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas_unavailable");
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height);
      if (!code) throw new Error("qr_not_found");
      handleText(code.data);
      setText(code.data);
    } catch (exception) {
      setError(`${L("QR नहीं पढ़ा गया", "Could not read that QR")}: ${String(exception)}`);
    }
  }

  function loadValid() {
    const row = wallet.value[0];
    if (!row) {
      setError(L("पहले हब से एक प्रमाण जारी करें।", "Issue a credential from the hub first."));
      return;
    }
    const value = JSON.stringify(row.envelope);
    setText(value);
    handleText(value);
  }

  function loadTampered() {
    const row = wallet.value[0];
    if (!row) {
      setError(L("पहले एक प्रमाण जारी करें।", "Issue a credential first."));
      return;
    }
    const envelope = JSON.parse(JSON.stringify(row.envelope)) as Envelope;
    const bytes = Uint8Array.from(atob(envelope.sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    envelope.sig = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const value = JSON.stringify(envelope);
    setText(value);
    handleText(value);
  }

  function loadRevoked() {
    const now = Math.floor(Date.now() / 1000);
    const payload: CredentialPayload = {
      id: "revoked-demo-0001",
      iss: ISSUER.kid,
      epoch: ISSUER.epoch,
      sub: "demo-student-01",
      skill: "TAILOR.L2",
      level: 2,
      ev: "d".repeat(64),
      iat: now,
      exp: now + 86_400 * 30,
      evidence_label: "revoked demo",
    };
    const envelope = signEnvelope({
      privateKey: ISSUER.privateKey,
      publicKey: ISSUER.publicKey,
      typ: "cred",
      payload,
    });
    const value = JSON.stringify(envelope);
    setText(value);
    handleText(value);
  }

  const age = result?.registryAgeDays ?? registryAgeDays(effectiveRegistry());

  return (
    <div class="screen">
      <PageHead
        kicker={L("सत्यापनकर्ता", "Verifier")}
        title={L("QR से प्रमाण जाँचें", "Verify a credential")}
        sub={L(
          "किसी भी फ़ोन पर, बिना नेटवर्क। रजिस्ट्री कितनी पुरानी है, यह हमेशा दिखता है।",
          "On any phone, with no network. The registry's age is always shown.",
        )}
      />

      {scanning ? (
        <section class="card" style="margin-bottom:12px">
          <video ref={videoRef} playsInline muted style="width:100%;border-radius:14px;background:#000" />
          <button class="btn secondary mt-2" onClick={stopCamera}>{L("कैमरा बंद करें", "Stop camera")}</button>
        </section>
      ) : (
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn" onClick={startCamera}>
            <Icon name="camera" size={17} />
            {L("कैमरा", "Camera")}
          </button>
          <label class="btn secondary" style="cursor:pointer">
            <Icon name="file" size={17} />
            {L("QR फ़ाइल", "QR file")}
            <input
              type="file"
              accept="image/*"
              style="display:none"
              onChange={(event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (file) void decodeFile(file);
              }}
            />
          </label>
        </div>
      )}

      <section class="card" style="margin-bottom:12px">
        <div class="field">
          <label for="credential-text">{L("प्रमाण पाठ चिपकाएँ", "Paste the credential envelope")}</label>
          <textarea
            id="credential-text"
            class="textarea"
            value={text}
            placeholder='{"v":1,"kid":"...","typ":"cred",...}'
            onInput={(event) => setText((event.target as HTMLTextAreaElement).value)}
          />
        </div>
        <div class="btn-row mt-2">
          <button class="btn secondary" onClick={() => { setText(""); setResult(null); setError(null); }}>
            {L("साफ़ करें", "Clear")}
          </button>
          <button class="btn" onClick={() => handleText(text)}>
            {L("जाँचें", "Verify")}
          </button>
        </div>
      </section>

      {error ? <div class="callout bad" style="margin-bottom:12px">{error}</div> : null}

      {result ? (
        <section class={`card`} style="margin-bottom:12px">
          <div class="row-between">
            <Badge tone={result.status === "VALID" ? "good" : result.status === "POSSIBLY_REVOKED" ? "warn" : "bad"}>
              {result.status === "VALID" ? L("वैध", "VALID") : result.status === "POSSIBLY_REVOKED" ? L("संभवतः रद्द", "POSSIBLY REVOKED") : L("अमान्य", "INVALID")}
            </Badge>
            <span class="tiny muted">{L("रजिस्ट्री", "Registry")} {age !== null ? `${age} ${L("दिन", "days")}` : "—"}</span>
          </div>

          {result.payload ? (
            <div class="stack mt-3">
              <div class="row-between"><span class="muted tiny">{L("कौशल", "Skill")}</span><strong>{result.payload.skill}</strong></div>
              <div class="row-between"><span class="muted tiny">{L("जारीकर्ता", "Issuer")}</span><span class="tiny">{result.issuer?.org ?? result.payload.iss}</span></div>
              <div class="row-between"><span class="muted tiny">{L("मान्यता", "Valid until")}</span><span class="tiny">{formatDate(new Date(result.payload.exp * 1000).toISOString())}</span></div>
              <div class="row-between"><span class="muted tiny">{L("विषय", "Subject")}</span><span class="sig">{result.payload.sub}</span></div>
            </div>
          ) : null}

          {result.reasons.length > 0 ? (
            <div class="row wrap mt-3">
              {result.reasons.map((reason) => (
                <Badge tone="bad" key={reason}>{reason}</Badge>
              ))}
            </div>
          ) : null}

          {age !== null && age > 30 ? (
            <div class="callout mt-3">
              {L(
                "रजिस्ट्री 30 दिन से पुरानी है। यह प्रमाण बाद में रद्द हो सकता है — ऑनलाइन पुष्टि करें।",
                "The registry is over 30 days old. This credential may have been revoked since — confirm online.",
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section class="card flat">
        <h3>{L("नाकामी के केस दिखाएँ", "Show the failure cases")}</h3>
        <p class="muted tiny mt-2">
          {L(
            "डेमो के लिए तीन उदाहरण: असली, छेड़ा हुआ और रद्द किया गया। तीसरा डेमो कुंजी से बनाया जाता है।",
            "Three demo cases: valid, tampered and revoked. The third is built with the demo key.",
          )}
        </p>
        <div class="btn-row mt-3">
          <button class="btn secondary small" onClick={loadValid}>{L("वैध", "Valid")}</button>
          <button class="btn secondary small" onClick={loadTampered}>{L("छेड़ा हुआ", "Tampered")}</button>
          <button class="btn secondary small" onClick={loadRevoked}>{L("रद्द", "Revoked")}</button>
        </div>
        <label class="row mt-3 tiny" style="gap:8px">
          <input
            type="checkbox"
            checked={staleRegistry}
            onChange={(event) => setStaleRegistry((event.target as HTMLInputElement).checked)}
          />
          {L("45 दिन पुरानी रजिस्ट्री दिखाएँ", "Pretend the registry is 45 days old")}
        </label>
      </section>

      <p class="tiny muted center mt-3">
        {L(
          "PKI सत्यापन PKI की तरह: पिन की गई रूट → जारीकर्ता प्रमाणपत्र → क्रेडेंशियल।",
          "Verification is a real chain: pinned root → issuer certificate → credential.",
        )}
      </p>
    </div>
  );
}
