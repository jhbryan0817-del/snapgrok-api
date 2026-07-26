import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Affiliate Marketing | SneakSolve",
  description:
    "Preview the planned SneakSolve affiliate program and its proposed 20% referral commission.",
};

const steps = [
  {
    number: "01",
    title: "Share your referral",
    copy: "Every eligible SneakSolve user will receive a personal referral link or code to share.",
  },
  {
    number: "02",
    title: "A friend subscribes",
    copy: "Your referral creates an account and purchases an eligible SneakSolve paid plan.",
  },
  {
    number: "03",
    title: "Earn 20%",
    copy: "The planned commission is 20% of qualifying subscription revenue attributed to your referral.",
  },
] as const;

export default function AffiliatePage() {
  return (
    <main className="info-page affiliate-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="affiliate" />

      <section className="info-hero shell" aria-labelledby="affiliate-title">
        <div>
          <span className="section-kicker">PROGRAM PREVIEW</span>
          <h1 id="affiliate-title">Recommend SneakSolve. Share the upside.</h1>
          <p>
            We are designing a simple affiliate program that rewards the people
            who help SneakSolve grow.
          </p>
        </div>
        <aside className="affiliate-rate-card" aria-label="Planned affiliate commission">
          <span>PLANNED COMMISSION</span>
          <strong>20%</strong>
          <p>of qualifying subscription revenue from referred customers</p>
        </aside>
      </section>

      <section className="info-section shell" aria-labelledby="affiliate-how-title">
        <div className="info-section-heading">
          <span className="section-kicker">HOW IT WILL WORK</span>
          <h2 id="affiliate-how-title">From recommendation to reward.</h2>
          <p>
            Participation is planned for every account tier—including the Free
            plan—once affiliate tracking and payouts are ready.
          </p>
        </div>
        <div className="affiliate-step-grid">
          {steps.map((step) => (
            <article className="affiliate-step" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="affiliate-details shell" aria-labelledby="affiliate-details-title">
        <div>
          <span className="section-kicker">THE IMPORTANT DETAILS</span>
          <h2 id="affiliate-details-title">Clear rules before launch.</h2>
        </div>
        <div className="affiliate-detail-list">
          <article>
            <h3>Who can participate?</h3>
            <p>
              The planned program will be open to eligible SneakSolve users,
              including users on the Free plan.
            </p>
          </article>
          <article>
            <h3>What counts as a referral?</h3>
            <p>
              A new customer must use your assigned referral link or code and
              complete an eligible paid-plan purchase.
            </p>
          </article>
          <article>
            <h3>How will commission be calculated?</h3>
            <p>
              Our current target is 20% of qualifying attributed subscription
              revenue. Final rules for refunds, taxes, fees, payout timing, and
              fraud prevention will appear in the program terms.
            </p>
          </article>
        </div>
      </section>

      <section className="preview-notice shell" aria-label="Affiliate program availability">
        <div>
          <strong>The affiliate program is not active yet.</strong>
          <p>
            This page previews the intended structure. Referral tracking,
            payouts, and final terms will launch with our future billing work.
          </p>
        </div>
        <Link href="/account?mode=sign-up">Create an account</Link>
      </section>
    </main>
  );
}
