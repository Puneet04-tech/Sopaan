import { enterApp, landingSeen, pack, theme } from "../state";
import { Icon, ThemeToggle } from "../components/ui";

const LINKS = [
  {
    n: "01",
    title: "A reviewed rule",
    copy: "Schemes become versioned, signed rule packs with the source quoted beside every condition.",
  },
  {
    n: "02",
    title: "An honest answer",
    copy: "Eligible, not eligible, or need info. The third answer is a feature, not a failure.",
  },
  {
    n: "03",
    title: "A next step",
    copy: "Documents, deadline, office and a helper — cached on the phone, useful at the counter.",
  },
  {
    n: "04",
    title: "Proof of skill",
    copy: "An assessor signs a credential. A second phone can verify it without a network.",
  },
  {
    n: "05",
    title: "Credit after proof",
    copy: "A capped, expiring allowance releases against evidence, never against a claim alone.",
  },
];

const ROLES = [
  {
    role: "Student",
    icon: "compass",
    copy: "Speaks a goal, sees what is true today, keeps a pathway and a portable skill passport.",
  },
  {
    role: "Facilitator",
    icon: "users",
    copy: "Runs a cohort, issues scoped credentials, and sees aggregate progress — not private profiles.",
  },
  {
    role: "Reviewer",
    icon: "shield",
    copy: "Checks a drafted rule against its source. Two signatures and a golden suite gate publication.",
  },
  {
    role: "Sponsor / verifier",
    icon: "building",
    copy: "Scans a QR to check a credential, and releases simulated credit only against valid proof.",
  },
];

export function Landing() {
  const version = pack.value?.version ?? "2026.10.14-1";
  const dark = theme.value === "dark";

  return (
    <div class="landing">
      <header class="landing-header">
        <a class="brand" href="#/welcome" onClick={(event) => event.preventDefault()}>
          <span class="brand-mark">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="15" width="5" height="6" rx="1.4" fill="#f2a71b" />
              <rect x="10" y="10" width="5" height="11" rx="1.4" fill="#e9661f" />
              <rect x="17" y="5" width="5" height="16" rx="1.4" fill="#fff8ea" />
            </svg>
          </span>
          <span>
            <span class="brand-name">SOPAAN</span>
            <span class="brand-tag">Every step, signed</span>
          </span>
        </a>
        <span class="topbar-spacer" />
        <nav class="landing-nav" aria-label="Landing">
          <a href="#problem">The gap</a>
          <a href="#chain">How it works</a>
          <a href="#roles">Who it serves</a>
        </nav>
        <ThemeToggle compact />
        <button class="btn saffron small landing-enter" onClick={() => void enterApp("/")}>
          Open app <Icon name="arrow" size={15} />
        </button>
      </header>

      <main>
        <section class="landing-hero">
          <div class="hero-copy">
            <div class="hero-eyebrow">
              <span class="hero-dot" />
              Maharashtra · offline-first · demo build
            </div>
            <h1>
              A stairway from <em>potential</em> to proof.
            </h1>
            <p class="hero-hindi">संभावना से प्रमाण तक — हर कदम पर हस्ताक्षर।</p>
            <p class="hero-lede">
              Sopaan turns a spoken goal into a verified next step, a skill into signed proof, and proof into
              funding. It works on the phone already in her hand, with or without a signal.
            </p>
            <div class="cta-row">
              <button class="btn saffron" onClick={() => void enterApp("/")}>
                Enter the app <Icon name="arrow" size={16} />
              </button>
              <button class="btn secondary" onClick={() => void enterApp("/tour")}>
                Walk Radha’s 8 steps
              </button>
            </div>
            <p class="hero-fine">
              No sign-up. Demo keys and simulated credits are labelled throughout.
            </p>
          </div>

          <aside class="proof-card" aria-label="A signed proof packet">
            <div class="proof-top">
              <div>
                <div class="proof-kicker">Proof packet</div>
                <div class="proof-id">schemes-mh · {version}</div>
              </div>
              <div class="proof-stamp">SIGNED</div>
            </div>
            <div class="proof-rows">
              <div class="proof-row">
                <span class="proof-num">01</span>
                <span><b>Rule</b><small>Post Matric · OBC</small></span>
                <span class="proof-tail">source cited</span>
              </div>
              <div class="proof-row">
                <span class="proof-num">02</span>
                <span><b>Answer</b><small>ELIGIBLE</small></span>
                <span class="proof-tail">c1 · c2 · c3</span>
              </div>
              <div class="proof-row">
                <span class="proof-num">03</span>
                <span><b>Next step</b><small>3 documents · 30 Nov</small></span>
                <span class="proof-tail">cached</span>
              </div>
              <div class="proof-row">
                <span class="proof-num">04</span>
                <span><b>Credential</b><small>Tailoring · Level 2</small></span>
                <span class="proof-tail">QR / Ed25519</span>
              </div>
              <div class="proof-row">
                <span class="proof-num">05</span>
                <span><b>Credit</b><small>₹500 · simulated</small></span>
                <span class="proof-tail">capped</span>
              </div>
            </div>
            <div class="proof-foot">
              <Icon name="lock" size={13} />
              <span>Verifies offline from a cached registry</span>
              <span class={`proof-signal ${dark ? "dark" : ""}`}>●</span>
            </div>
          </aside>
        </section>

        <section class="landing-section" id="problem">
          <div class="section-head">
            <div class="section-index">01 — The gap</div>
            <h2>The missing link is not ambition.</h2>
            <p>
              A scholarship exists. A form sits in an office. A skill is real but cannot be proved. Credit waits
              for trust, and trust waits for paper. The chain breaks between each hand-off.
            </p>
          </div>
          <div class="gap-grid">
            <article class="gap-card">
              <span class="gap-mark">A</span>
              <h3>Guidance is scattered</h3>
              <p>Notices, portals, a teacher’s memory. Families miss what they were always entitled to.</p>
            </article>
            <article class="gap-card">
              <span class="gap-mark">B</span>
              <h3>Proof is paper</h3>
              <p>A certificate in a plastic sleeve cannot be checked by a distant employer or a second phone.</p>
            </article>
            <article class="gap-card">
              <span class="gap-mark">C</span>
              <h3>Money waits for trust</h3>
              <p>Sponsors cannot release against a claim; learners cannot show the milestone was reached.</p>
            </article>
          </div>
        </section>

        <section class="landing-section" id="chain">
          <div class="section-head wide">
            <div>
              <div class="section-index">02 — The chain</div>
              <h2>Five links. One signature.</h2>
            </div>
            <p>
              Each link produces a small artifact that the next link can check. Nothing depends on a dashboard
              being online at the moment of truth.
            </p>
          </div>
          <ol class="chain-list">
            {LINKS.map((link) => (
              <li class="chain-item" key={link.n}>
                <span class="chain-num">{link.n}</span>
                <div>
                  <h3>{link.title}</h3>
                  <p>{link.copy}</p>
                </div>
                <span class="chain-check"><Icon name="check" size={15} /></span>
              </li>
            ))}
          </ol>
        </section>

        <section class="field-band">
          <div class="field-copy">
            <div class="section-index">03 — Field conditions</div>
            <h2>Designed for the phone she already owns.</h2>
            <p>
              After the first install, guidance, the pathway and the skill passport work with the network off.
              The app never pretends a cloud answer arrived when it did not.
            </p>
          </div>
          <div class="field-facts">
            <div><Icon name="sync" size={18} /><b>Offline after first load</b><span>Cached signed pack, local outbox.</span></div>
            <div><Icon name="book" size={18} /><b>Hindi · Marathi · English</b><span>Language is a signed pack, not an app release.</span></div>
            <div><Icon name="shield" size={18} /><b>No Aadhaar number</b><span>Pseudonymous device identity; raw audio stays local.</span></div>
            <div><Icon name="spark" size={18} /><b>Honest states</b><span>Demo keys, simulated credits and unverified rules are labelled.</span></div>
          </div>
        </section>

        <section class="landing-section" id="roles">
          <div class="section-head">
            <div class="section-index">04 — Roles</div>
            <h2>One proof chain, four points of view.</h2>
            <p>Each role sees the minimum it needs. Aggregate dashboards replace private-profile browsing.</p>
          </div>
          <div class="role-grid">
            {ROLES.map((role) => (
              <article class="role-card" key={role.role}>
                <span class="role-icon"><Icon name={role.icon} size={19} /></span>
                <h3>{role.role}</h3>
                <p>{role.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section class="landing-cta">
          <div>
            <div class="section-index">Try the whole chain</div>
            <h2>Start with Radha. Turn the network off halfway.</h2>
            <p>Eight steps, one demo learner, no account. The app explains what is real and what is simulated.</p>
          </div>
          <div class="cta-row">
            <button class="btn saffron" onClick={() => void enterApp("/tour")}>
              Walk the demo <Icon name="arrow" size={16} />
            </button>
            <button class="btn secondary" onClick={() => void enterApp("/")}>
              Go to dashboard
            </button>
          </div>
        </section>
      </main>

      <footer class="landing-footer">
        <span>SOPAAN · हर कदम, प्रमाणित</span>
        <span>Demo build · dev keys · simulated credits</span>
        <button class="link-btn" onClick={() => void enterApp("/")}>
          {landingSeen.value ? "Open app" : "Enter app"}
        </button>
        <button class="link-btn" onClick={() => void enterApp("/settings")}>
          Settings
        </button>
      </footer>
    </div>
  );
}
