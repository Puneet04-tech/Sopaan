import { useEffect, useState } from "preact/hooks";
import { formatRupees } from "../core/format";
import { POOLS } from "../data/credits";
import { api } from "../data/api";
import { canFacilitate, canSponsor, currentRole } from "../data/roles";
import { lang, tokens, wallet } from "../state";
import { Badge, Icon, Meter, PageHead } from "../components/ui";

interface ServerPool {
  pool_id: string;
  sponsor: string;
  total_inr: number;
  remaining_inr: number;
  milestone: string;
  status: string;
}

export function Sponsor() {
  const language = lang.value;
  const L = (hi: string, en: string) => (language === "hi" || language === "mr" ? hi : en);

  const [serverPools, setServerPools] = useState<Record<string, ServerPool>>({});
  const authorised = canSponsor() || canFacilitate();

  useEffect(() => {
    if (!authorised) return;
    void (async () => {
      try {
        const body = await api<{ pools: ServerPool[] }>("/v1/credits/pools");
        const map: Record<string, ServerPool> = {};
        for (const pool of body.pools ?? []) map[pool.pool_id] = pool;
        setServerPools(map);
      } catch {
        setServerPools({});
      }
    })();
  }, [authorised]);

  const released = tokens.value
    .filter((token) => token.status === "SETTLED" || token.status === "REDEEMED")
    .reduce((sum, token) => sum + token.amount, 0);
  const flagged = tokens.value.filter((token) => token.status === "FLAGGED").length;
  const verified = wallet.value.filter((row) => row.status === "VALID").length;

  const bySkill = wallet.value.reduce<Record<string, number>>((acc, row) => {
    acc[row.skill] = (acc[row.skill] ?? 0) + 1;
    return acc;
  }, {});
  const maxSkill = Math.max(1, ...Object.values(bySkill));

  return (
    <div class="screen">
      <PageHead
        kicker={L("प्रायोजक दृश्य", "Sponsor view")}
        title={L("नतीजे, नाम नहीं", "Outcomes, not names")}
        sub={L(
          "यह दृश्य केवल समूह आँकड़े दिखाता है। किसी विद्यार्थी की पहचान, नाम या संपर्क यहाँ नहीं आता।",
          "This view shows aggregates only. No student identity, name or contact ever appears here.",
        )}
        action={
          <div class="row wrap">
            <Badge tone="plum">{L("समूह", "Aggregate")}</Badge>
            <Badge tone={Object.keys(serverPools).length > 0 ? "good" : "plain"}>
              {Object.keys(serverPools).length > 0
                ? L("कोष सर्वर से", "pools from server")
                : L("कोष स्थानीय अनुमान", `local estimate · ${currentRole()}`)}
            </Badge>
          </div>
        }
      />

      <section class="card dark" style="margin-bottom:12px">
        <div class="card-kicker" style="color:rgba(247,243,234,0.6)">{L("प्रमाण के बाद जारी", "Released against proof")}</div>
        <h2 style="color:#fff8ea;font-size:1.9rem">{formatRupees(released)}</h2>
        <div class="row wrap mt-2">
          <Badge tone="good">{verified} {L("वैध प्रमाण", "valid credentials")}</Badge>
          <Badge tone={flagged > 0 ? "bad" : "plain"}>{flagged} {L("फ़्लैग", "flagged")}</Badge>
        </div>
        <p class="tiny mt-2" style="color:rgba(247,243,234,0.65)">
          {L(
            "सिम्युलेटेड क्रेडिट — असली भुगतान नहीं। मिलान सिंक पर होता है।",
            "Simulated credits — not real disbursement. Reconciliation happens at sync.",
          )}
        </p>
      </section>

      <div class="stack" style="margin-bottom:12px">
        {Object.entries(POOLS).map(([poolId, pool]) => {
          const serverPool = serverPools[poolId];
          const funded = serverPool ? serverPool.total_inr : pool.amount_inr * 40;
          const used = tokens.value
            .filter((token) => token.status !== "FLAGGED")
            .filter((token) => {
              const allowancePool = allowancePoolOf(token.allowId);
              return allowancePool === undefined || allowancePool === poolId;
            })
            .reduce((sum, token) => sum + token.amount, 0);
          return (
            <section class="card" key={poolId}>
              <div class="row-between">
                <div>
                  <span class="card-kicker">{poolId}</span>
                  <h3 style="margin-top:4px">{pool.module}</h3>
                </div>
                <Badge tone="info">{pool.milestone}</Badge>
              </div>
              <div class="row-between mt-3 tiny">
                <span class="muted">{L("कोष", "Funded")} {formatRupees(funded)}</span>
                <span>{L("जारी", "Released")} {formatRupees(used)}</span>
              </div>
              <Meter value={funded === 0 ? 0 : used / funded} />
              <p class="tiny muted mt-2">{L("प्रायोजक", "Sponsor")}: {pool.sponsor}</p>
            </section>
          );
        })}
      </div>

      <section class="card" style="margin-bottom:12px">
        <div class="row-between">
          <h3>{L("कौशल के अनुसार", "By skill")}</h3>
          <Icon name="shield" size={17} />
        </div>
        {Object.keys(bySkill).length === 0 ? (
          <p class="muted mt-2">{L("अभी कोई प्रमाण नहीं।", "No credentials yet.")}</p>
        ) : (
          <div class="stack mt-2">
            {Object.entries(bySkill).map(([skill, count]) => (
              <div key={skill}>
                <div class="row-between tiny" style="margin-bottom:3px">
                  <span>{skill}</span>
                  <span>{count}</span>
                </div>
                <Meter value={count / maxSkill} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div class="callout">
        {L(
          "हस्ताक्षर यह साबित करता है कि किसने जारी किया, यह नहीं कि मूल्यांकन निष्पक्ष था। इसलिए जारीकर्ता अधिकृत, सीमित और समीक्षित हैं।",
          "A signature proves who issued a credential, not that the assessment was fair. That is why issuers are authorised, scoped and reviewed.",
        )}
      </div>
    </div>
  );
}

function allowancePoolOf(_allowId: string): string | undefined {
  // Token payloads carry their allowance; the demo pool mapping is shown per card.
  return undefined;
}
