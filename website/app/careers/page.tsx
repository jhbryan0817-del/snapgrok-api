import { SiteHeader } from "../site-header";

const openPositions = [
  { title: "Product Designer", team: "Product", location: "Global" },
  { title: "Product Engineer (Windows)", team: "Engineering", location: "Global" },
  { title: "Product Engineer (Backend)", team: "Engineering", location: "Global" },
  { title: "Product Engineer (Full Stack)", team: "Engineering", location: "Global" },
  { title: "Security Engineer", team: "Security", location: "Global" },
  { title: "Accounting Lead", team: "Finance", location: "Seoul, Korea" },
  { title: "Legal Counsel", team: "Legal", location: "Seoul, Korea" },
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
          <br />
          We build reliable, privacy-conscious software that helps learners move through with less friction.
        </p>
      </section>

      <section className="careers-openings shell" aria-labelledby="positions-title">
        <div className="careers-openings-heading">
          <span className="section-kicker">OFFERED POSITIONS</span>
          <h2 id="positions-title">Help us shape a better environment for learning.</h2>
          <p>
            We value thoughtful people who care about reliable software, captivating designs, and responsible use of AI.
            <br />
            If your experience aligns with our work, we would be glad to hear from you.
          </p>
        </div>

        <div className="careers-position-list">
          {openPositions.map((position) => (
            <article className="careers-position-item" key={position.title}>
              <span><b>{position.title}</b><small>{position.team}</small></span>
              <span className="careers-position-location">{position.location}</span>
            </article>
          ))}
        </div>

        <a
          className="careers-application-button"
          href="mailto:sneaksolve@gmail.com?subject=Zenaian%20Career%20Application"
        >
          <span>Send your resume</span>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4.5 10h11m-4.5-4.5L15.5 10 11 14.5" />
          </svg>
        </a>
      </section>
    </main>
  );
}
