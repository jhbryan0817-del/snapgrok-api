import type { ReactNode } from "react";
import Link from "next/link";
import { AnswerToolbarDemo } from "./answer-toolbar-demo";
import { HeroBrowserDemo } from "./hero-browser-demo";
import { SiteHeader } from "./site-header";
import { ManualWorkflowDemo, ZenaianWorkflowDemo } from "./study-workflow-demo";
import { ContextExperience, ShortcutExperience } from "./workflow-preferences-demo";

export default function HomePage() {
  return (
    <main id="top" className="landing-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <div className="hero-scene-background" aria-hidden="true" />

      <SiteHeader />

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy reveal reveal-first" data-animate>
          <div className="trust-pill">
            <span>#1 AI-Powered MCQ Assistant Tool</span>
          </div>

          <h1 id="hero-title">Ask in Silence, Stay Focused</h1>
          <span className="hero-copy-divider" aria-hidden="true" />
          <p className="hero-description">
            <span>Analyze on-screen multiple-choice questions with Zenaian.</span>
            <span>Get accurate answers instantly without leaving your tab.</span>
          </p>
        </div>

        <HeroBrowserDemo />

        <div className="hero-followup reveal reveal-second" data-animate>
          <div className="hero-actions">
            <Link className="primary-button" href="/account?mode=sign-up">
              <PaperPlaneIcon />
              <span>Install Zenaian</span>
              <ArrowRightIcon />
            </Link>
            <a className="secondary-button" href="#receive-answers">Explore features</a>
          </div>

          <div className="quiet-note">
            <CheckCircleIcon />
            <span>Trusted by 20,000+ Users</span>
          </div>
        </div>
      </section>

      <section id="receive-answers" className="features-panel explore-panel shell reveal" data-animate aria-label="Explore Zenaian">
        <AnswerToolbarDemo />

        <div className="feature-grid explore-controls-grid">
          <article className="feature-card feature-shortcuts interactive-card">
            <div className="feature-copy">
              <h3>Two capture modes. Your shortcuts.</h3>
              <p>
                Assign custom keyboard shortcuts for the full visible tab or
                draw a precise box around one question.
              </p>
            </div>
            <ShortcutExperience />
          </article>

          <article className="feature-card feature-context interactive-card">
            <div className="feature-copy">
              <h3>Add context when the question needs it.</h3>
              <p>
                Save an optional custom instruction for subject conventions,
                course level, notation, or the reasoning style you prefer.
              </p>
            </div>
            <ContextExperience />
          </article>
        </div>
      </section>

      <section className="features-panel study-intelligence-panel shell reveal" data-animate aria-label="Study intelligence">
        <div className="feature-grid study-intelligence-grid">
          <article className="feature-card study-speed-card interactive-card">
            <div className="study-time-background" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <div className="feature-copy">
              <h3>Accelerate Test Preparation</h3>
              <p>Eliminate unnecessary steps - maximize your learning efficiency.</p>
            </div>
            <div className="study-speed-stage">
              <ManualWorkflowDemo />

              <div className="memorization-flow workflow-flowchart" aria-label="Manual workflow takes five vertical steps; Zenaian takes two vertical steps">
                <div className="flowchart-path flowchart-path-manual">
                  <span className="flowchart-label">Manual</span>
                  <div className="flowchart-lines">
                    <ol className="flowchart-steps">
                      <li className="flowchart-step"><p>Screenshot</p></li>
                      <li className="flowchart-step"><p>Switch screen</p></li>
                      <li className="flowchart-step"><p>Paste and ask</p></li>
                      <li className="flowchart-step"><p>Confirm</p></li>
                      <li className="flowchart-step"><p>Return</p></li>
                    </ol>
                  </div>
                </div>
                <div className="flowchart-path flowchart-path-zenaian">
                  <span className="flowchart-label">Zenaian</span>
                  <div className="flowchart-lines">
                    <ol className="flowchart-steps">
                      <li className="flowchart-step"><p>Capture</p></li>
                      <li className="flowchart-step"><p>Confirm</p></li>
                    </ol>
                  </div>
                </div>
              </div>

              <ZenaianWorkflowDemo />
            </div>
          </article>

          <article className="feature-card study-model-card interactive-card">
            <div className="feature-copy">
              <h3>Powered by Grok 4.5</h3>
              <p>Zenaian strives for accurate, instant answers from a frontier AI model.</p>
            </div>
            <div className="benchmark-visual benchmark-visual-duo" aria-label="Grok 4.5 software engineering and response-speed comparisons">
              <section className="benchmark-chart benchmark-orb benchmark-swe" aria-labelledby="swe-marathon-title">
                <span className="benchmark-crown" aria-hidden="true">♕</span>
                <div className="benchmark-heading">
                  <strong id="swe-marathon-title">SWE Marathon</strong>
                  <span>pass@1 resolution · higher is better</span>
                </div>
                <div className="benchmark-row benchmark-row-grok"><span>Grok 4.5</span><i><b className="bar-100" /></i><em>29%</em></div>
                <div className="benchmark-row"><span>Opus 4.8</span><i><b className="bar-90" /></i><em>26%</em></div>
                <div className="benchmark-row"><span>Fable</span><i><b className="bar-83" /></i><em>24%</em></div>
                <div className="benchmark-row"><span>Opus 4.7</span><i><b className="bar-55" /></i><em>16%</em></div>
              </section>
              <section className="benchmark-chart benchmark-orb benchmark-speed" aria-labelledby="response-speed-title">
                <span className="benchmark-speed-badge" aria-hidden="true"><LightningIcon /></span>
                <div className="benchmark-heading">
                  <strong id="response-speed-title">Response speed</strong>
                  <span>time to first answer token · lower is better</span>
                </div>
                <div className="benchmark-row benchmark-row-grok"><span>Grok 4.5</span><i><b className="speed-bar-grok" /></i><em>8s</em></div>
                <div className="benchmark-row"><span>Opus 4.8</span><i><b className="speed-bar-opus" /></i><em>16s</em></div>
                <div className="benchmark-row"><span>GPT-5.5</span><i><b className="speed-bar-gpt55" /></i><em>94s</em></div>
                <div className="benchmark-row"><span>Fable 5</span><i><b className="speed-bar-fable" /></i><em>124s</em></div>
                <div className="benchmark-row"><span>GPT-5.6 Sol</span><i><b className="speed-bar-sol" /></i><em>134s</em></div>
              </section>
            </div>
            <small className="model-disclaimer">
              SWE figures reported by xAI; competitor figures are drawn from published system cards or benchmark leaderboards. {" "}
              <a href="https://x.ai/news/grok-4-5" target="_blank" rel="noreferrer">View source</a>. Speed figures: Artificial Analysis independent API measurements, August 2026. Zenaian is independent and is not endorsed by xAI.
            </small>
          </article>
        </div>
      </section>

      <section id="privacy" className="privacy-panel privacy-priority-panel shell reveal" data-animate aria-labelledby="privacy-title">
        <div className="privacy-heading">
          <LockIcon />
          <h2 id="privacy-title">Privacy &amp; Security</h2>
        </div>
        <div className="privacy-priority-grid">
          <div className="privacy-list">
            <PrivacyItem icon={<TrashIcon />} title="Screenshots are not stored by Zenaian">
              Captured images are processed transiently,
              <br />
              our application database never stores any of your images.
            </PrivacyItem>
            <PrivacyItem icon={<EyeOffIcon />} title="A deliberately minimal workflow">
              Zenaian returns the result through the extension icon,
              <br />
              minimizing unnecessary interface activities.
            </PrivacyItem>
          </div>
          <div className="privacy-disposal-illustration" aria-hidden="true">
            <div className="privacy-paper">
              <i /><i /><i />
            </div>
            <div className="privacy-disposal-path"><i /><i /><i /></div>
            <div className="privacy-bin">
              <span />
              <i /><i /><i />
            </div>
          </div>
        </div>
        <p className="privacy-retention-note">
          <strong>Processing and retention note.</strong> Zenaian does not save captured images to its application database. Transient request data is released from active processing when a request finishes, ordinarily within a few minutes. Our AI provider, xAI, may retain API inputs and outputs for up to 30 days by default for abuse and misuse auditing, and may retain limited data longer where required for safety, security, compliance, or law. <Link href="/privacy">Explore our Privacy Policy</Link>.
        </p>
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
function LightningIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></svg>;
}
