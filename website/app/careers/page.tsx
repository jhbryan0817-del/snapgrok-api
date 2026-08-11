import { SiteHeader } from "../site-header";

const openPositions = [
  { title: "Product Designer", team: "Product" },
  { title: "Product Engineer (Windows)", team: "Engineering" },
  { title: "Product Engineer (Backend)", team: "Engineering" },
  { title: "Product Engineer (Full Stack)", team: "Engineering" },
  { title: "Security Engineer", team: "Security" },
  { title: "Accounting Lead", team: "Finance" },
  { title: "Legal Counsel", team: "Legal" },
] as const;

export default function CareersPage() {
  return (
    <main className="info-page editorial-page careers-page careers-page-v2">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="careers" />

      <section className="editorial-hero shell" aria-labelledby="careers-title">
        <span className="section-kicker">CAREERS AT ZENAIAN</span>
        <h1 id="careers-title">We Keep Moving.</h1>
        <p>
          Zenaian is a global education software company based in Seoul, Korea.
          We build reliable, privacy-conscious software that helps learners move
          through with less friction.
        </p>
      </section>

      <section className="careers-openings shell" aria-labelledby="positions-title">
        <div className="careers-openings-heading">
          <span className="section-kicker">OPEN POSITIONS</span>
          <h2 id="positions-title">Join our team</h2>
          <p>Every role is based in Seoul unless otherwise stated during the interview process.</p>
        </div>

        <div className="careers-position-list">
          {openPositions.map((position) => (
            <a
              href={`mailto:sneaksolve@gmail.com?subject=${encodeURIComponent(`Zenaian Career Application - ${position.title}`)}`}
              key={position.title}
            >
              <span><b>{position.title}</b><small>{position.team}</small></span>
              <span className="careers-position-location">Seoul, Korea</span>
              <span className="careers-position-arrow" aria-hidden="true">&rarr;</span>
            </a>
          ))}
        </div>

        <div className="careers-contact careers-contact-inline" aria-labelledby="careers-contact-title">
          <div>
            <span className="section-kicker">WORK WITH US</span>
            <h2 id="careers-contact-title">Your work can shape how people learn.</h2>
          </div>
          <a href="mailto:sneaksolve@gmail.com?subject=Zenaian%20Career%20Application">
            Send your resume
          </a>
        </div>
      </section>
    </main>
  );
}
