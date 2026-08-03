import type { Metadata } from "next";
import { BrandName } from "../brand-logo";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Contact Us | Zenaian",
  description: "The Zenaian contact page is being prepared.",
};

export default function ContactPage() {
  return (
    <main className="info-page placeholder-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <SiteHeader activeItem="contact" />
      <section className="placeholder-panel shell" aria-labelledby="contact-title">
        <span className="section-kicker">CONTACT US</span>
        <h1 id="contact-title">A direct line is coming soon.</h1>
        <p>
          We are preparing a simple way to reach the <BrandName /> team. Contact options will appear here in a future update.
        </p>
        <span className="placeholder-status">Page placeholder</span>
      </section>
    </main>
  );
}
