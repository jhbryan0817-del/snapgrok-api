import { AccountNav } from "./account-nav";

const Icon = ({ src, alt = "" }: { src: string; alt?: string }) => (
  <img className="result-icon" src={src} alt={alt} />
);

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SneakSolve home">
          <img src="/sneaksolve-icons/default.png" alt="" />
          <span>SneakSolve</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
          <AccountNav />
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-copy">
          <div className="product-pill">
            <span /> Chrome extension · Always on
          </div>
          <h1>Capture the question.<br /><em>Keep your focus.</em></h1>
          <p className="hero-lede">
            SneakSolve turns any visible multiple-choice question into a quiet,
            one-glance answer—right in your Chrome toolbar.
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="/account?mode=sign-up">
              Create your account <span aria-hidden="true">→</span>
            </a>
            <a className="platform-note" href="#how-it-works">
              <span className="chrome-mark" aria-hidden="true" /> See how it works
            </a>
          </div>
          <div className="trust-line">
            <span className="shield" aria-hidden="true">✓</span>
            Screenshots and answers are never stored
          </div>
        </div>

        <div className="hero-visual" aria-label="SneakSolve product interface preview">
          <div className="browser-card">
            <div className="browser-topbar">
              <div className="traffic"><i /><i /><i /></div>
              <div className="address-bar"><span>lock</span> study.example.com</div>
              <div className="toolbar-icons">
                <span />
                <img src="/sneaksolve-icons/result-a.png" alt="SneakSolve answer A in the Chrome toolbar" />
              </div>
            </div>
            <div className="question-sheet">
              <span className="question-label">QUESTION 08</span>
              <h2>Which statement best explains this result?</h2>
              <div className="answer-row selected"><b>A</b><span>The observed value supports the hypothesis.</span></div>
              <div className="answer-row"><b>B</b><span>The variables show no meaningful relationship.</span></div>
              <div className="answer-row"><b>C</b><span>The sample size invalidates every conclusion.</span></div>
              <div className="selection-corners" aria-hidden="true"><i /><i /><i /><i /></div>
            </div>
          </div>

          <div className="extension-panel">
            <div className="extension-header">
              <img src="/sneaksolve-icons/default.png" alt="" />
              <div><strong>SneakSolve</strong><span>MCQ capture assistant</span></div>
              <span className="always-on"><i />Always on</span>
            </div>
            <div className="panel-section">
              <span className="panel-eyebrow">CAPTURE</span>
              <h3>Choose how to scan</h3>
              <div className="capture-option">
                <span className="capture-glyph full" />
                <div><strong>Visible tab</strong><small>Capture the whole visible webpage.</small></div>
                <kbd>Ctrl ⇧ A</kbd>
              </div>
              <div className="capture-option">
                <span className="capture-glyph zone" />
                <div><strong>Select area</strong><small>Drag over only the question you need.</small></div>
                <kbd>Ctrl ⇧ X</kbd>
              </div>
            </div>
            <div className="result-preview">
              <span><Icon src="/sneaksolve-icons/result-a.png" /><small>Single</small></span>
              <span><Icon src="/sneaksolve-icons/result-multi.png" /><small>Multiple</small></span>
              <span><Icon src="/sneaksolve-icons/result-inconclusive.png" /><small>Unclear</small></span>
              <span><Icon src="/sneaksolve-icons/processing.png" /><small>Working</small></span>
            </div>
          </div>
          <div className="floating-note">
            <Icon src="/sneaksolve-icons/result-a.png" />
            <span><strong>Answer ready</strong><small>Shown for 4 seconds</small></span>
          </div>
        </div>
      </section>

      <section className="flow-section" id="how-it-works" aria-labelledby="flow-title">
        <div className="section-intro">
          <span className="section-kicker">HOW IT WORKS</span>
          <h2 id="flow-title">From question to answer<br />in three quiet steps.</h2>
          <p>No pasted text, no extra tab, and no answer window covering your work.</p>
        </div>
        <div className="flow-grid">
          <article>
            <span className="step-number">01</span>
            <div className="step-visual select-visual">
              <div className="mini-page"><i /><i /><i /><span /></div>
              <div className="mini-cursor">↖</div>
            </div>
            <h3>Capture</h3>
            <p>Scan the visible tab or drag over one selected area with a keyboard shortcut.</p>
          </article>
          <article>
            <span className="step-number">02</span>
            <div className="step-visual thinking-visual">
              <Icon src="/sneaksolve-icons/processing.png" alt="Processing" />
              <div><i /><i /><i /></div>
            </div>
            <h3>Think</h3>
            <p>Your instruction and image are sent for one request while SneakSolve works quietly.</p>
          </article>
          <article>
            <span className="step-number">03</span>
            <div className="step-visual answer-visual">
              <Icon src="/sneaksolve-icons/result-a.png" alt="Answer A" />
              <span>4 sec</span>
            </div>
            <h3>Answer</h3>
            <p>The answer appears directly on the toolbar, then the default icon returns.</p>
          </article>
        </div>
      </section>

      <section className="feature-section" id="features" aria-labelledby="features-title">
        <div className="section-intro compact-intro">
          <span className="section-kicker">DESIGNED FOR FLOW</span>
          <h2 id="features-title">Highly Customizable,<br />Flexible, and Discreet.</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card capture-feature">
            <div className="feature-copy">
              <span>CAPTURE YOUR WAY</span>
              <h3>Whole tab or just the part that matters.</h3>
              <p>Two editable Chrome shortcuts keep every capture within reach.</p>
            </div>
            <div className="key-demo">
              <div><span className="capture-glyph full" /><strong>Visible tab</strong><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>A</kbd></div>
              <div><span className="capture-glyph zone" /><strong>Select area</strong><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>X</kbd></div>
            </div>
          </article>

          <article className="feature-card result-feature">
            <div className="feature-copy">
              <span>MULTIPLE ANSWERS SUPPORTED</span>
              <h3>Every correct choice, still in one tiny icon.</h3>
              <p>Multiple-answer MCQs are fully supported. Hover over the toolbar icon to reveal the exact answer choices.</p>
            </div>
            <div className="multi-answer-stage" aria-label="Hover demonstration for a multiple-answer result">
              <div className="hover-hint">Hover to reveal answers</div>
              <div className="multi-hover-demo" tabIndex={0} aria-describedby="multi-answer-tooltip">
                <Icon src="/sneaksolve-icons/result-multi.png" alt="Two correct answers" />
                <div className="answer-tooltip" id="multi-answer-tooltip" role="tooltip">
                  <span>Selected answers</span>
                  <strong>A · C</strong>
                </div>
              </div>
              <div className="result-state state-a"><Icon src="/sneaksolve-icons/result-a.png" alt="Single answer" /></div>
              <div className="result-state state-unclear"><Icon src="/sneaksolve-icons/result-inconclusive.png" alt="Inconclusive" /></div>
            </div>
          </article>

          <article className="feature-card instruction-feature">
            <div className="instruction-demo" aria-label="Custom AI instruction preview">
              <div className="instruction-demo-header">
                <div><span>AI INSTRUCTION</span><strong>Shared prompt</strong></div>
                <span className="edit-chip">Edit</span>
              </div>
              <p>Answer only with the option letter or letters. Select every correct response.</p>
              <div className="instruction-status"><span /> Sent with each capture</div>
            </div>
            <div className="feature-copy">
              <span>YOUR INSTRUCTION, YOUR RULES</span>
              <h3>Guide every answer with your own prompt.</h3>
              <p>Write a custom instruction once. SneakSolve sends it alongside each screenshot so the response follows the format and approach you want.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="privacy-section" id="privacy" aria-labelledby="privacy-title">
        <div className="privacy-copy">
          <span className="section-kicker">TRANSIENT BY DESIGN</span>
          <h2 id="privacy-title">Privacy by Design.</h2>
          <p>SneakSolve is built around a simple rule: process the current request without building a history of what you captured.</p>
        </div>
        <div className="privacy-points">
          <div><span>01</span><p>Screenshots and answers are not saved.</p></div>
          <div><span>02</span><p>Only the current image and the instruction you wrote are sent.</p></div>
          <div><span>03</span><p>The temporary request document closes when the operation ends.</p></div>
        </div>
        <div className="privacy-mark" aria-hidden="true">
          <img src="/sneaksolve-icons/default.png" alt="" />
          <div className="privacy-ring one" /><div className="privacy-ring two" />
        </div>
      </section>

      <footer>
        <a className="brand" href="#top" aria-label="Back to the top">
          <img src="/sneaksolve-icons/default.png" alt="" />
          <span>SneakSolve</span>
        </a>
        <p>MCQ capture assistant · Built for Chrome</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
