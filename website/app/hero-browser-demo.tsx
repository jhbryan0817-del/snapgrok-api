export function HeroBrowserDemo() {
  const answers = [
    ["A", "The nucleus"],
    ["B", "The mitochondrion"],
    ["C", "The Golgi apparatus"],
    ["D", "The ribosome"],
  ] as const;

  return (
    <figure
      className="product-illustration hero-media-intro hero-browser-demo"
      aria-labelledby="browser-demo-caption"
    >
      <div className="illustration-glow" aria-hidden="true" />
      <div className="browser-demo-frame demo-loop">
        <div className="browser-demo-chrome" aria-hidden="true">
          <div className="browser-window-controls"><i /><i /><i /></div>
          <div className="browser-demo-tab">Cell biology &middot; Practice set</div>
          <div className="browser-demo-address">learn.example.com/practice</div>
          <div className="browser-demo-toolbar">
            <span className="toolbar-icon toolbar-icon-idle">Z</span>
            <span className="toolbar-icon toolbar-icon-processing">
              <img src="/zenaian-icons/processing.png" alt="" />
            </span>
            <span className="toolbar-icon toolbar-icon-answer">B</span>
          </div>
        </div>

        <div className="browser-demo-page">
          <div className="demo-question-card">
            <div className="demo-question-meta">
              <span>QUESTION 08 OF 20</span>
              <span>Biology review</span>
            </div>
            <h2>What is known as the powerhouse of the cell?</h2>
            <div className="demo-answer-list">
              {answers.map(([letter, answer]) => (
                <div className="demo-answer" key={letter}>
                  <span>{letter}</span>
                  <p>{answer}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="demo-shortcut" aria-label="Control Shift A keyboard shortcut">
            <span>Capture visible question</span>
            <div>
              <kbd className="demo-key-control">Ctrl</kbd>
              <b>+</b>
              <kbd className="demo-key-shift">Shift</kbd>
              <b>+</b>
              <kbd className="demo-key-a">A</kbd>
            </div>
          </div>

          <div className="demo-capture-flash" aria-hidden="true" />
        </div>
      </div>

      <figcaption id="browser-demo-caption">
        <span><strong>1</strong> Press your shortcut</span>
        <span><strong>2</strong> Capture the question</span>
        <span><strong>3</strong> Read the answer</span>
      </figcaption>
    </figure>
  );
}
