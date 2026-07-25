import type { ReactNode } from "react";
import Link from "next/link";
import { AccountNav } from "./account-nav";

const answerStates = [
  {
    icon: "/sneaksolve-icons/result-a.png",
    title: "Single answer",
    description: "One answer found: option A",
  },
  {
    icon: "/sneaksolve-icons/result-multi.png",
    title: "Multiple answers",
    description: "Hover on the icon to expand the list of correct options",
  },
  {
    icon: "/sneaksolve-icons/processing.png",
    title: "Processing",
    description: "Checking the question.",
  },
  {
    icon: "/sneaksolve-icons/result-inconclusive.png",
    title: "Inconclusive",
    description: "Not enough info.",
  },
  {
    icon: "/sneaksolve-icons/result-error.png",
    title: "Error",
    description: "Answering process was interrupted",
  },
] as const;

export default function HomePage() {
  return (
    <main id="top" className="landing-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />

      <header className="site-header shell">
        <Link className="brand" href="/" aria-label="SneakSolve home">
          <img src="/sneaksolve-icons/default.png" alt="" />
          <span>SneakSolve</span>
        </Link>

        <nav className="primary-nav" aria-label="Primary navigation">
          <a className="active" href="#top">Home</a>
          <a href="#why-sneaksolve">Why SneakSolve</a>
          <a href="/account?mode=sign-up">Pricing</a>
        </nav>

        <AccountNav />
      </header>

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="trust-pill">
            <ShieldCheckIcon />
            <span>Discreet. Private. Undetected.</span>
          </div>

          <h1 id="hero-title">
            Capture in silence,
            <br />
            answers remain
            <br />
            undetected
          </h1>

          <p className="hero-description">
            SneakSolve is a discreet MCQ capture assistant that helps you get answers without drawing attention.
          </p>

          <div className="hero-actions">
            <Link className="primary-button" href="/account?mode=sign-up">
              <PaperPlaneIcon />
              <span>Get SneakSolve</span>
              <ArrowRightIcon />
            </Link>
            <a className="secondary-button" href="#why-sneaksolve">Learn more</a>
          </div>

          <div className="quiet-note">
            <CheckCircleIcon />
            <span>Works quietly in the background</span>
          </div>
        </div>

        <div className="demo-stage" id="demo" aria-label="SneakSolve demo video placeholder">
          <div className="demo-dots" aria-hidden="true" />
          <div className="demo-window">
            <div className="demo-browser">
              <span />
              <span />
              <span />
              <div className="demo-address">study.example.com</div>
            </div>

            <div className="demo-question">
              <span className="demo-kicker">QUESTION 05</span>
              <h2>Which statement best explains this result?</h2>
              <DemoOption letter="A" text="The observed value supports the hypothesis." active />
              <DemoOption letter="B" text="The variables show no meaningful relationship." />
              <DemoOption letter="C" text="The sample size invalidates every conclusion." />
            </div>

            <div className="demo-extension-card">
              <div className="demo-extension-heading">
                <img src="/sneaksolve-icons/default.png" alt="" />
                <div><strong>SneakSolve</strong><span>MCQ capture assistant</span></div>
              </div>
              <span className="demo-label">CAPTURE</span>
              <strong>Choose how to scan</strong>
              <div className="demo-choice"><span>Visible tab</span><kbd>Ctrl A</kbd></div>
              <div className="demo-choice"><span>Select area</span><kbd>Ctrl X</kbd></div>
              <div className="demo-mini-states" aria-hidden="true">
                {answerStates.slice(0, 4).map((state) => (
                  <img key={state.title} src={state.icon} alt="" />
                ))}
              </div>
            </div>

            <div className="demo-overlay">
              <button className="play-button" type="button" aria-label="Demo video coming soon" disabled>
                <PlayIcon />
              </button>
              <strong>Demo video coming here</strong>
              <span>See SneakSolve in action (30s preview)</span>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-panel shell" aria-label="SneakSolve usage statistics">
        <article className="stat-item">
          <div className="stat-icon"><UsersIcon /></div>
          <div>
            <strong>10k+</strong>
            <h2>active users</h2>
            <p>Trusting SneakSolve every day</p>
          </div>
        </article>
        <div className="stat-divider" aria-hidden="true" />
        <article className="stat-item">
          <div className="stat-icon"><ChartIcon /></div>
          <div>
            <strong>100k+</strong>
            <h2>questions solved</h2>
            <p>Answers delivered discreetly</p>
          </div>
        </article>
      </section>

      <section id="why-sneaksolve" className="icon-workflow shell" aria-labelledby="icon-workflow-title">
        <div className="workflow-copy">
          <span className="section-kicker">SneakSolve</span>
          <h2 id="icon-workflow-title">How the icon works</h2>
          <ol className="workflow-steps">
            <li><span>1</span><p>Pin the extension</p></li>
            <li><span>2</span><p>Keep the icon visible<small>in your Chrome header</small></p></li>
            <li><span>3</span><p>The icon changes to<small>one of these states</small></p></li>
          </ol>
          <p className="workflow-note">Know exactly what the extension is showing at a glance.</p>
        </div>

        <div className="workflow-arrow" aria-hidden="true"><ArrowRightIcon /></div>

        <div className="state-grid">
          {answerStates.map((state) => (
            <article className="state-card" key={state.title}>
              <img src={state.icon} alt="" />
              <h3>{state.title}</h3>
              <p>{state.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="privacy" className="privacy-panel shell" aria-labelledby="privacy-title">
        <div className="privacy-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="privacy-float privacy-float-lock"><LockIcon /></div>
          <div className="privacy-float privacy-float-shield"><ShieldCheckIcon /></div>
          <div className="privacy-float privacy-float-eye"><EyeOffIcon /></div>
          <div className="shield-illustration">
            <div className="shield-inner"><LockIcon /></div>
          </div>
        </div>

        <div className="privacy-content">
          <div className="privacy-heading">
            <LockIcon />
            <h2 id="privacy-title">Privacy &amp; Security</h2>
          </div>
          <p className="privacy-intro">
            Your privacy is our priority. SneakSolve is built to keep you safe, confident, and undetected — always.
          </p>

          <div className="privacy-list">
            <PrivacyItem icon={<TrashIcon />} title="Screenshots are not stored">
              Captured images are not saved anywhere on your device or our servers.
            </PrivacyItem>
            <PrivacyItem icon={<ShieldCheckIcon />} title="Private processing">
              Analysis is handled securely and privately, without keeping your captured image.
            </PrivacyItem>
            <PrivacyItem icon={<EyeOffIcon />} title="Designed to remain discreet">
              Built to operate quietly in the background while you focus.
            </PrivacyItem>
          </div>
        </div>
      </section>
    </main>
  );
}

function DemoOption({ letter, text, active = false }: { letter: string; text: string; active?: boolean }) {
  return (
    <div className={`demo-option${active ? " active" : ""}`}>
      <span>{letter}</span>
      <p>{text}</p>
    </div>
  );
}

function PrivacyItem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="privacy-item">
      <div className="privacy-item-icon">{icon}</div>
      <div><h3>{title}</h3><p>{children}</p></div>
    </article>
  );
}

function ShieldCheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
}
function PaperPlaneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-8.2 18-2.1-7.7L3 11.2 21 3Z"/><path d="m10.7 13.3 4.8-4.8"/></svg>;
}
function ArrowRightIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>;
}
function CheckCircleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>;
}
function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z"/></svg>;
}
function UsersIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-2.2A4.8 4.8 0 0 1 8.3 12h1.4a4.8 4.8 0 0 1 4.8 4.8V19"/><circle cx="17" cy="9" r="2.3"/><path d="M15.6 13.1h1.8a3.6 3.6 0 0 1 3.6 3.6V19"/></svg>;
}
function ChartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16"/><path d="m7 16 4-5 3 2 5-6"/></svg>;
}
function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>;
}
function EyeOffIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.8 5.2A10.7 10.7 0 0 1 12 5c5.2 0 9 5 9 7a9.8 9.8 0 0 1-2.1 3.2M6.2 6.3C4.1 7.6 3 10.1 3 12c0 2 3.8 7 9 7 1.2 0 2.3-.3 3.3-.7"/></svg>;
}
function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>;
}
