import { useState } from "preact/hooks";
import { formatDate, formatRupees } from "../core/format";
import { mintToken, POOLS, redeemToken, settleTokens } from "../data/credits";
import { serverBase } from "../data/sync";
import type { CredentialRow } from "../data/db";
import { allowance, lang, notify, refreshLocal, registry, tokens, wallet } from "../state";
import { Badge, Icon, PageHead } from "../components/ui";

export function Credits() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);
  const [busy, setBusy] = useState<string | null>(null);

  const pool = allowance.value ? POOLS[allowance.value.poolId] : undefined;
  const milestone = pool?.milestone ?? "TAILOR.L2";
  const eligibleCredentials = wallet.value.filter((row) => row.status === "VALID" && row.skill === milestone);
  const cap = allowance.value?.cap ?? 0;
  const spent = tokens.value.filter((token) => token.status !== "FLAGGED").reduce((sum, token) => sum + token.amount, 0);
  const remaining = Math.max(0, cap - spent);

  async function mint(credential: CredentialRow) {
    setBusy(credential.credId);
    try {
      const result = await mintToken(credential, registry.value);
      notify(
        result.ok
          ? `${formatRupees(result.token?.amount ?? 0)} credit minted (counter ${result.token?.ctr})`
          : `Mint blocked: ${result.reason}`,
        result.ok ? "good" : "bad",
      );
    } catch (error) {
      notify(`Mint failed: ${String(error)}`, "bad");
    } finally {
      await refreshLocal();
      setBusy(null);
    }
  }

  async function redeem(tokenId: string) {
    setBusy(tokenId);
    try {
      const result = await redeemToken(tokenId, registry.value);
      notify(result.ok ? L("मॉड्यूल खुल गया, रसीद सहेजी गई", "Module unlocked, receipt saved") : `Redeem blocked: ${result.reason}`, result.ok ? "good" : "bad");
    } catch (error) {
      notify(`Redeem failed: ${String(error)}`, "bad");
    } finally {
      await refreshLocal();
      setBusy(null);
    }
  }

  async function settle() {
    setBusy("settle");
    try {
      const result = await settleTokens(await serverBase());
      if (result.offline) notify(L("सर्वर उपलब्ध नहीं — रसीदें रेडीम्ड हैं", "Server unavailable — receipts stay redeemed"), "warn");
      else notify(`${result.settled.length} settled, ${result.flagged.length} flagged`, result.flagged.length > 0 ? "warn" : "good");
    } catch (error) {
      notify(`Settlement failed: ${String(error)}`, "bad");
    } finally {
      await refreshLocal();
      setBusy(null);
    }
  }

  return (
    <div class="screen">
      <PageHead
        kicker={L("क्रेडिट", "Credits")}
        title={L("प्रमाण के बाद धन", "Funding that follows proof")}
        sub={L(
          "प्रायोजक पूल, सीमित लीज़, गिने हुए टोकन। वैध प्रमाण के बिना कुछ नहीं खुलता।",
          "Sponsor pool, capped lease, counted tokens. Nothing unlocks without a valid credential.",
        )}
        action={<Badge tone="plum">{L("सिम्युलेटेड", "Simulated")}</Badge>}
      />

      <section class="card dark" style="margin-bottom:12px">
        <div class="row-between">
          <div>
            <div class="card-kicker" style="color:rgba(247,243,234,0.6)">{L("अनुमति लीज़", "Allowance lease")}</div>
            <h2 style="color:#fff8ea">{formatRupees(cap)}</h2>
            <p class="tiny" style="color:rgba(247,243,234,0.7)">
              {allowance.value ? `${L("समाप्ति", "expires")} ${formatDate(new Date(allowance.value.expiresAt * 1000).toISOString())}` : L("अभी नहीं", "none yet")}
            </p>
          </div>
          <div class="center">
            <div style="font-size:1.6rem;font-weight:900;color:#ffd479">{formatRupees(remaining)}</div>
            <div class="tiny" style="color:rgba(247,243,234,0.7)">{L("शेष", "remaining")}</div>
          </div>
        </div>
        <div class="meter" style="margin-top:12px;background:rgba(255,255,255,0.14)">
          <span style={`width:${cap === 0 ? 0 : Math.min(100, (spent / cap) * 100)}%`} />
        </div>
        <div class="row-between mt-2 tiny" style="color:rgba(247,243,234,0.7)">
          <span>{L("खर्च", "spent")} {formatRupees(spent)}</span>
          <span>{tokens.value.filter((token) => token.status === "REDEEMED").length} {L("मिलान बाकी", "pending settlement")}</span>
        </div>
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("क्रेडिट बनाएँ", "Mint credit")}</h3>
          <span class="tiny muted">{milestone}</span>
        </div>
        {eligibleCredentials.length === 0 ? (
          <p class="muted mt-2">
            {L(
              `इस पूल के लिए ${milestone} वाला वैध प्रमाण चाहिए। पहले हब से प्रमाण जारी करें।`,
              `This pool needs a valid ${milestone} credential. Issue one from the hub first.`,
            )}
          </p>
        ) : (
          <div class="stack mt-2">
            {eligibleCredentials.map((credential) => (
              <div class="list-item" key={credential.credId}>
                <span class="leading good"><Icon name="id" size={17} /></span>
                <div class="grow">
                  <strong style="font-size:0.85rem">{credential.skill}</strong>
                  <div class="tiny muted">{L("वैध प्रमाण", "Valid credential")} · {credential.credId.slice(0, 8)}</div>
                </div>
                <button class="btn saffron small" disabled={busy === credential.credId} onClick={() => mint(credential)}>
                  {busy === credential.credId ? "…" : L("बनाएँ", "Mint")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("टोकन", "Tokens")}</h3>
          <button class="link-btn" disabled={busy === "settle"} onClick={settle}>
            {busy === "settle" ? "…" : L("सिंक पर मिलान", "Settle at sync")}
          </button>
        </div>
        {tokens.value.length === 0 ? (
          <p class="muted mt-2">{L("अभी कोई टोकन नहीं।", "No tokens yet.")}</p>
        ) : (
          <table class="simple mt-2">
            <thead>
              <tr>
                <th>{L("काउंटर", "Ctr")}</th>
                <th>{L("राशि", "Amount")}</th>
                <th>{L("स्थिति", "Status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.value.map((token) => (
                <tr key={token.tokenId}>
                  <td>{token.ctr}</td>
                  <td>{formatRupees(token.amount)}</td>
                  <td>
                    <Badge tone={token.status === "SETTLED" ? "good" : token.status === "REDEEMED" ? "warn" : token.status === "FLAGGED" ? "bad" : "plain"}>
                      {token.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td>
                    {token.status === "MINTED" ? (
                      <button class="btn secondary small" disabled={busy === token.tokenId} onClick={() => redeem(token.tokenId)}>
                        {L("इस्तेमाल", "Use")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="tiny muted mt-2">
          {L(
            "एक ही काउंटर दोबारा इस्तेमाल नहीं हो सकता। मिलान पर दोहराव FLAGGED होता है और नुकसान लीज़ की सीमा तक सीमित रहता है।",
            "A counter cannot be reused. A duplicate is FLAGGED at settlement and the loss stays bounded by the lease cap.",
          )}
        </p>
      </section>

      <section class="card tint">
        <h3>{L("पूल नियम", "Pool rule")}</h3>
        <dl class="kv mt-2">
          <dt>{L("पूल", "Pool")}</dt>
          <dd>{allowance.value?.poolId ?? "—"}</dd>
          <dt>{L("मील का पत्थर", "Milestone")}</dt>
          <dd>{milestone}</dd>
          <dt>{L("मॉड्यूल", "Module")}</dt>
          <dd>{pool?.module ?? "—"}</dd>
          <dt>{L("प्रायोजक", "Sponsor")}</dt>
          <dd>{pool?.sponsor ?? "—"}</dd>
        </dl>
        <p class="tiny muted mt-2">
          {L(
            "यह सिम्युलेटेड, गैर-नकद अधिकार है। सोपान न ऋणदाता है, न छात्रवृत्ति प्राधिकरण, न भुगतान प्रदाता।",
            "This is a simulated, non-cash entitlement. Sopaan is not a lender, scholarship authority or payment provider.",
          )}
        </p>
      </section>
    </div>
  );
}
