import Link from "next/link";
import { SiteHeader } from "../site-header";

const studyAreas = [
  "Anatomy & physiology",
  "Law and legal concepts",
  "History",
  "Psychology",
  "Biology",
  "Professional certifications",
];

const useCases = [
  {
    number: "01",
    title: "Practice-bank review",
    copy: "Move through permitted question banks without rebuilding the same screenshot-and-paste workflow for every item.",
  },
  {
    number: "02",
    title: "Lecture and textbook recap",
    copy: "Check MCQs created from lecture notes or textbook chapters while the source material is still fresh.",
  },
  {
    number: "03",
    title: "Certification preparation",
    copy: "Review knowledge-heavy practice questions for professional exams whenever the provider allows outside study tools.",
  },
  {
    number: "04",
    title: "Answer-key verification",
    copy: "Use a second opinion when a practice answer key looks questionable, then return to the underlying material to confirm why.",
  },
];

export default function UseCasesPage() {
  return (
    <main className="info-page editorial-page use-cases-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="use-cases" />

      <section className="editorial-hero shell" aria-labelledby="use-cases-title">
        <span className="section-kicker">USE CASES</span>
        <h1 id="use-cases-title">Spend your study time on the question, not the workflow.</h1>
        <p>
          Zenaian is built for multiple-choice practice—especially
          memorization-heavy courses where repetition matters and manual AI
          prompting breaks concentration.
        </p>
      </section>

      <section className="editorial-feature shell" aria-labelledby="study-preparation-title">
        <div className="editorial-feature-copy">
          <span className="section-kicker">PRIMARY USE CASE</span>
          <h2 id="study-preparation-title">Faster preparation for fact-heavy courses.</h2>
          <p>
            A normal AI workflow makes you capture a screenshot, switch tabs,
            paste the image, ask a question, confirm the response, and return.
            Zenaian keeps the permitted practice question in front of you and
            compresses that interruption into capture and confirmation.
          </p>
          <div className="subject-cloud" aria-label="Example study areas">
            {studyAreas.map((area) => <span key={area}>{area}</span>)}
          </div>
        </div>

        <div className="workflow-comparison" aria-label="Manual and Zenaian workflows">
          <div>
            <strong>Manual</strong>
            <p>Screenshot → Switch screen → Paste and ask → Confirm → Return</p>
          </div>
          <div className="workflow-comparison-fast">
            <strong>Zenaian</strong>
            <p>Capture → Confirm</p>
          </div>
        </div>
      </section>

      <section className="editorial-section shell" aria-labelledby="more-use-cases-title">
        <div className="editorial-section-heading">
          <span className="section-kicker">MORE WAYS TO USE ZENAIAN</span>
          <h2 id="more-use-cases-title">One focused MCQ tool, several study routines.</h2>
        </div>
        <div className="editorial-card-grid">
          {useCases.map((item) => (
            <article className="editorial-card" key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <aside className="responsible-use-note shell" aria-label="Responsible use">
        <div>
          <strong>Built for legitimate study and permitted practice.</strong>
          <p>
            Zenaian must not be used to cheat, bypass assessment rules, or
            complete an exam where outside assistance is prohibited.
          </p>
        </div>
        <Link href="/terms">Read acceptable-use terms</Link>
      </aside>
    </main>
  );
}
