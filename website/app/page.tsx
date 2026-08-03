import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "./site-header";

const answerStates = [
  {
    icon: "/zenaian-icons/result-a.png",
    iconClass: "",
    title: "Single answer",
    description: "One answer found: option A",
  },
  {
    icon: "/zenaian-icons/result-multi.png",
    iconClass: "",
    title: "Multiple answers",
    description: "Hover on the icon to see every correct option",
  },
  {
    icon: "/zenaian-icons/processing.png",
    iconClass: "",
    title: "Processing",
    description: "Checking the captured question",
  },
  {
    icon: "/zenaian-icons/result-inconclusive.png",
    iconClass: "",
    title: "Inconclusive",
    description: "Not enough information to answer",
  },
  {
    icon: "/zenaian-icons/result-error.png",
    iconClass: "",
    title: "Error",
    description: "The answering process was interrupted",
  },
] as const;

export default function HomePage() {
  return (
    <main id="top" className="landing-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />

      <SiteHeader />

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy reveal reveal-first">
          <div className="trust-pill">
            <ShieldCheckIcon />
            <span>Fast. Reliable. Private.</span>
          </div>

          <h1 id="hero-title">
            Ask in Silence,
            <br />
            Stay Focused
          </h1>
          <p className="hero-description">
            Zenaian analyzes on-screen multiple-choice questions and delivers
            answers instantly, without pulling you away from your tab.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/account?mode=sign-up">
              <PaperPlaneIcon />
              <span>Start for free</span>
              <ArrowRightIcon />
            </Link>
            <a className="secondary-button" href="#features">Explore features</a>
          </div>

          <div className="quiet-note">
            <CheckCircleIcon />
            <span>Two capture modes. One quiet workflow.</span>
          </div>
        </div>

        <figure className="product-illustration reveal reveal-second" aria-labelledby="illustration-caption">
          <div className="illustration-glow" aria-hidden="true" />
          <img
            src="/zenaian-how-it-works.png"
            alt="A multiple-choice astronomy question on a browser screen, captured with the Ctrl Shift A shortcut, with Zenaian displaying answer B near the extension icon."
          />
          <figcaption id="illustration-caption">
            <span><strong>1</strong> Press your shortcut</span>
            <span><strong>2</strong> Capture the question</span>
            <span><strong>3</strong> Read the answer</span>
          </figcaption>
        </figure>
      </section>

      <section className="stats-panel shell reveal" aria-label="Zenaian usage statistics">
        <article className="stat-item">
          <div className="stat-icon"><UsersIcon /></div>
          <div className="stat-line">
            <strong>20k+</strong>
            <div>
              <h2>Active Users</h2>
              <p>Trusting Zenaian every day</p>
            </div>
          </div>
        </article>
        <div className="stat-divider" aria-hidden="true" />
        <article className="stat-item">
          <div className="stat-icon"><ChartIcon /></div>
          <div className="stat-line">
            <strong>300k+</strong>
            <div>
              <h2>Questions Solved</h2>
              <p>Answers delivered securely</p>
            </div>
          </div>
        </article>
      </section>

      <section id="why-zenaian" className="icon-workflow shell reveal" aria-labelledby="icon-workflow-title">
        <div className="workflow-copy">
          <span className="section-kicker">Zenaian</span>
          <h2 id="icon-workflow-title">Receive your answers</h2>
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
            <article className="state-card interactive-card" key={state.title}>
              <img
                className={state.iconClass || undefined}
                src={state.icon}
                alt=""
              />
              <h3>{state.title}</h3>
              <p>{state.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="features-panel shell reveal" aria-labelledby="features-title">
        <div className="features-heading">
          <span className="section-kicker">BUILT AROUND YOUR WORKFLOW</span>
          <h2 id="features-title">Make Zenaian work your way.</h2>
          <p>Choose how you capture, then add the context that helps the AI reason with you.</p>
        </div>

        <div className="feature-grid">
          <article className="feature-card feature-shortcuts interactive-card">
            <div className="feature-number">01</div>
            <div className="feature-copy">
              <h3>Two capture modes. Your shortcuts.</h3>
              <p>
                Assign custom keyboard shortcuts for the full visible tab or
                draw a precise box around one question.
              </p>
            </div>
            <div className="shortcut-preview" aria-label="Example custom shortcuts">
              <div>
                <span>Capture visible tab</span>
                <kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>A</kbd>
              </div>
              <div>
                <span>Capture selected area</span>
                <kbd>Ctrl</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>X</kbd>
              </div>
            </div>
          </article>

          <article className="feature-card feature-context interactive-card">
            <div className="feature-number">02</div>
            <div className="feature-copy">
              <h3>Add context when the question needs it.</h3>
              <p>
                Save an optional custom instruction for subject conventions,
                course level, notation, or the reasoning style you prefer.
              </p>
            </div>
            <div className="context-preview" aria-label="Example custom AI context">
              <span>ADD CONTEXT</span>
              <strong>Custom Instruction for AI</strong>
              <p>Use relativistic conventions and choose every defensible answer.</p>
              <small>Optional &middot; the default instruction always works</small>
            </div>
          </article>
        </div>
      </section>

      <section id="privacy" className="privacy-panel shell reveal" aria-labelledby="privacy-title">
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
            Zenaian is designed to keep your captured questions temporary,
            your account protected, and your workflow quiet.
          </p>
          <div className="privacy-list">
            <PrivacyItem icon={<TrashIcon />} title="Screenshots are not stored">
              Captured images are processed transiently and are not saved on
              your device or on the Zenaian server.
            </PrivacyItem>
            <PrivacyItem icon={<EyeOffIcon />} title="Designed to remain discreet">
              The extension communicates through its toolbar icon so you can
              stay focused on the page in front of you.
            </PrivacyItem>
          </div>
        </div>
      </section>
    </main>
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
