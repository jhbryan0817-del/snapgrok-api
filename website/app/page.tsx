import type { ReactNode } from "react";
import Link from "next/link";
import { AnswerToolbarDemo } from "./answer-toolbar-demo";
import { HeroBrowserDemo } from "./hero-browser-demo";
import { SiteHeader } from "./site-header";

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
          <span className="hero-copy-divider hero-demo-divider" aria-hidden="true" />
        </div>

        <HeroBrowserDemo />

        <div className="hero-followup reveal reveal-second" data-animate>
          <div className="hero-actions">
            <Link className="primary-button" href="/account?mode=sign-up">
              <PaperPlaneIcon />
              <span>Get Zenaian</span>
              <ArrowRightIcon />
            </Link>
            <a className="secondary-button" href="#receive-answers">Explore features</a>
          </div>

          <div className="quiet-note">
            <CheckCircleIcon />
            <span>Trusted by 20k+ Active Subscribers</span>
          </div>
        </div>
      </section>

      <section id="receive-answers" className="icon-workflow shell reveal" data-animate aria-labelledby="icon-workflow-title">
        <div className="workflow-copy">
          <span className="section-kicker">Zenaian</span>
          <h2 id="icon-workflow-title">Receive your answers</h2>
          <p className="workflow-note">
            Select or hover over an icon state to see exactly what Zenaian is
            communicating through your Chrome toolbar.
          </p>
        </div>
        <AnswerToolbarDemo />
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

      <section className="features-panel study-intelligence-panel shell reveal" data-animate aria-labelledby="study-intelligence-title">
        <div className="features-heading">
          <span className="section-kicker">FASTER STUDY, FRONTIER INTELLIGENCE</span>
          <h2 id="study-intelligence-title">Simplify studying. Prepare for tests faster.</h2>
          <p>
            Zenaian streamlines memorization-heavy study and test preparation by
            turning a multi-step search into one quiet capture. It uses Grok 4.5,
            one of the frontier and most capable AI models available, to reason
            through each question and return a precise answer quickly.
          </p>
        </div>

        <div className="feature-grid study-intelligence-grid">
          <article className="feature-card study-speed-card interactive-card">
            <div className="feature-number">03</div>
            <div className="feature-copy">
              <h3>Fewer steps between a question and understanding.</h3>
              <p>
                Stay in your study flow while Zenaian removes the need to take a
                screenshot, switch screens, paste the question, and navigate back.
              </p>
            </div>
            <div className="memorization-flow" aria-label="A faster review workflow">
              <div className="review-track review-track-manual">
                <span>Manual</span><p>Screenshot</p><i /> <p>Switch Screen</p><i /> <p>Paste and Ask</p><i /> <p>Confirm</p><i /> <p>Return</p>
              </div>
              <div className="review-track review-track-zenaian">
                <span>Zenaian</span><p>Capture</p><i /> <p>Confirm</p>
              </div>
            </div>
          </article>

          <article className="feature-card study-model-card interactive-card">
            <div className="feature-number">04</div>
            <div className="feature-copy">
              <h3>Powered by Grok 4.5.</h3>
              <p>
                Grok 4.5 brings advanced reasoning and broad knowledge to every
                capture, helping Zenaian deliver clear, timely confirmations.
              </p>
            </div>
            <div className="frontier-visual" aria-label="Grok 4.5 model qualities">
              <div className="frontier-model-mark">
                <span>GROK</span>
                <strong>4.5</strong>
                <small>FRONTIER MODEL</small>
              </div>
              <div className="frontier-quality-list">
                <span><i />Advanced reasoning</span>
                <span><i />Broad knowledge</span>
                <span><i />Fast confirmation</span>
              </div>
            </div>
            <small className="model-disclaimer">
              Zenaian is an independent product and is not affiliated with or
              endorsed by xAI.
            </small>
          </article>
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
