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
        <div className="hero-copy reveal reveal-first" data-animate>
          <div className="trust-pill">
            <span>#1 AI-Powered MCQ Assistant Tool</span>
          </div>

          <h1 id="hero-title">Ask in Silence, Stay Focused</h1>
          <span className="hero-copy-divider" aria-hidden="true" />
          <p className="hero-description">
            <span>Analyze on-screen multiple-choice questions with Zenaian</span>
            <span>Get accurate answers instantly without leaving your tab.</span>
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/account?mode=sign-up">
              <PaperPlaneIcon />
              <span>Get Zenaian</span>
              <ArrowRightIcon />
            </Link>
            <a className="secondary-button" href="#features">Explore features</a>
          </div>

          <div className="quiet-note">
            <CheckCircleIcon />
            <span>Trusted by 20k+ Active Subscribers</span>
          </div>
        </div>

        <figure className="product-illustration hero-media-intro" aria-labelledby="illustration-caption">
          <div className="illustration-glow" aria-hidden="true" />
          <div className="hero-product-screen">
            <img
              src="/zenaian-how-it-works-clean.png"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              alt="A multiple-choice astronomy question on a browser screen, captured with the Ctrl Shift A shortcut, with Zenaian displaying answer B near the extension icon."
            />
          </div>
          <figcaption id="illustration-caption">
            <span><strong>1</strong> Press your shortcut</span>
            <span><strong>2</strong> Capture the question</span>
            <span><strong>3</strong> Read the answer</span>
          </figcaption>
        </figure>
      </section>

      <section id="why-zenaian" className="icon-workflow shell reveal" data-animate aria-labelledby="icon-workflow-title">
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

      <section id="features" className="features-panel shell reveal" data-animate aria-labelledby="features-title">
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

      <section className="memorization-panel shell reveal" data-animate aria-labelledby="memorization-title">
        <div className="memorization-copy">
          <span className="section-kicker">BUILT FOR RAPID REVIEW</span>
          <h2 id="memorization-title">Accelerate memorization-based test preparations.</h2>
          <p>
            For fact-heavy courses, confirm a multiple-choice answer without
            taking a screenshot, switching screens, and interrupting your study flow.
          </p>
        </div>
        <div className="memorization-flow" aria-label="A faster review workflow">
          <div className="subject-chips" aria-label="Example courses">
            <span>Psychology</span>
            <span>History</span>
            <span>Economics</span>
            <span>Law</span>
            <span>Anatomy</span>
          </div>
          <div className="review-track review-track-manual">
            <span>Manual</span><p>Screenshot</p><i /> <p>Switch Screen</p><i /> <p>Paste and Ask</p><i /> <p>Confirm</p><i /> <p>Return</p>
          </div>
          <div className="review-track review-track-zenaian">
            <span>Zenaian</span><p>Capture</p><i /> <p>Confirm</p>
          </div>
        </div>
      </section>

      <section className="frontier-panel shell reveal" data-animate aria-labelledby="frontier-title">
        <div className="frontier-copy">
          <span className="section-kicker">FRONTIER INTELLIGENCE</span>
          <h2 id="frontier-title">Powered by Grok 4.5.</h2>
          <p>
            Built by xAI and trained by SpaceX, the Grok 4.5 brings
            frontier reasoning to problems. Zenaian uses it to deliver
            precise answers quickly, keeping every confirmation on pace.
          </p>
          <small>
            Zenaian is an independent product and is not affiliated with or
            endorsed by xAI or SpaceX.
          </small>
        </div>
        <div className="frontier-visual" aria-label="Grok 4.5 model qualities">
          <div className="frontier-model-mark">
            <span>GROK</span>
            <strong>4.5</strong>
            <small>FRONTIER MODEL</small>
          </div>
          <div className="frontier-quality-list">
            <span><i />Precise reasoning</span>
            <span><i />Broad knowledge</span>
            <span><i />Timely results</span>
          </div>
        </div>
      </section>

      <section id="privacy" className="privacy-panel shell reveal" data-animate aria-labelledby="privacy-title">
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
function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>;
}
function EyeOffIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.8 5.2A10.7 10.7 0 0 1 12 5c5.2 0 9 5 9 7a9.8 9.8 0 0 1-2.1 3.2M6.2 6.3C4.1 7.6 3 10.1 3 12c0 2 3.8 7 9 7 1.2 0 2.3-.3 3.3-.7"/></svg>;
}
function TrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>;
}
