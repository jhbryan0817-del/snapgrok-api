import { SiteHeader } from "../site-header";

const engineeringRoles = [
  "Full-stack product engineer",
  "Backend and platform engineer",
  "Chrome extension engineer",
  "AI evaluation and reliability engineer",
  "Application security engineer",
  "Quality and release engineer",
];

const businessRoles = [
  "Product manager",
  "Growth and lifecycle marketer",
  "Community and partnerships manager",
  "Business operations manager",
];

export default function CareersPage() {
  return (
    <main className="info-page editorial-page careers-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="careers" />

      <section className="editorial-hero shell" aria-labelledby="careers-title">
        <span className="section-kicker">CAREERS</span>
        <h1 id="careers-title">Help build calmer, faster learning tools.</h1>
        <p>
          Zenaian is an early-stage education technology company creating a
          focused Chrome-based assistant for multiple-choice practice.
        </p>
      </section>

      <section className="mission-grid shell" aria-label="Company mission and vision">
        <article>
          <span>01</span>
          <h2>Company</h2>
          <p>
            We combine a secure account platform, a lightweight browser
            extension, and high-quality AI reasoning into one deliberately
            narrow MCQ study experience.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Mission</h2>
          <p>
            Remove repetitive interface work from legitimate test preparation
            so learners can spend more time understanding and remembering.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Vision</h2>
          <p>
            Make trustworthy, privacy-conscious study assistance feel like a
            natural part of focused learning rather than another distracting tab.
          </p>
        </article>
      </section>

      <section className="roles-section shell" aria-labelledby="positions-title">
        <div className="editorial-section-heading">
          <span className="section-kicker">POSITIONS AVAILABLE</span>
          <h2 id="positions-title">The team we are preparing to grow.</h2>
          <p>
            These role families are an initial hiring roadmap. Scope, location,
            employment type, and timing will be confirmed with shortlisted candidates.
          </p>
        </div>
        <div className="role-columns">
          <article>
            <h3>Engineering &amp; product</h3>
            <ul>
              {engineeringRoles.map((role) => <li key={role}>{role}</li>)}
            </ul>
          </article>
          <article>
            <h3>Marketing &amp; management</h3>
            <ul>
              {businessRoles.map((role) => <li key={role}>{role}</li>)}
            </ul>
          </article>
        </div>
      </section>

      <section className="career-cta shell" aria-labelledby="join-title">
        <div>
          <span className="section-kicker">JOIN THE TEAM</span>
          <h2 id="join-title">See a place for yourself at Zenaian?</h2>
          <p>
            Email your resume and a short note about the problems you want to
            solve. Our temporary recruiting address will change as the company grows.
          </p>
        </div>
        <a href="mailto:sneaksolve@gmail.com?subject=Zenaian%20Career%20Application">
          Submit your resume
        </a>
      </section>
    </main>
  );
}
