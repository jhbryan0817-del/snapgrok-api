import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Terms of Service | Zenaian",
  description: "The Zenaian Terms of Service page is being prepared.",
};

export default function TermsPage() {
  return (
    <main className="info-page placeholder-page">
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader />
      <section className="placeholder-panel shell" aria-labelledby="terms-title">
        <span className="section-kicker">TERMS OF SERVICE</span>
        <h1 id="terms-title">Terms are being prepared.</h1>
        <p>
          Zenaian&apos;s complete Terms of Service will be published here after final review.
        </p>
        <span className="placeholder-status">Page placeholder</span>
      </section>
    </main>
  );
}
