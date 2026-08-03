import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Privacy Policy | SneakSolve",
  description:
    "Learn how SneakSolve currently handles account information, captured questions, and service data.",
};

export default function PrivacyPage() {
  return (
    <main className="info-page privacy-policy-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="privacy" />

      <section className="policy-hero shell" aria-labelledby="privacy-policy-title">
        <span className="section-kicker">PRIVACY AT SNEAKSOLVE</span>
        <h1 id="privacy-policy-title">Privacy Policy</h1>
        <p>
          This working draft explains how the current SneakSolve product and
          Whop-powered subscriptions handle information. It must receive final
          legal review before general commercial availability.
        </p>
        <div className="policy-meta">
          <span>Working draft</span>
          <span>Updated August 2, 2026</span>
        </div>
      </section>

      <section className="policy-layout shell">
        <nav className="policy-index" aria-label="Privacy policy sections">
          <strong>On this page</strong>
          <a href="#information">Information we process</a>
          <a href="#use">How we use information</a>
          <a href="#sharing">Service providers</a>
          <a href="#retention">Storage and retention</a>
          <a href="#choices">Your choices</a>
          <a href="#security">Security</a>
          <a href="#changes">Policy changes</a>
        </nav>

        <div className="policy-content">
          <section id="information">
            <span>01</span>
            <h2>Information we process</h2>
            <p>
              SneakSolve processes the information needed to provide the
              website, account system, and browser-extension workflow:
            </p>
            <ul>
              <li>
                Account and authentication information, such as your name,
                email address, profile image, sign-in methods, and active
                sessions, is managed through Clerk.
              </li>
              <li>
                Captured question images and any optional custom instruction
                you provide are sent for analysis when you use the extension.
              </li>
              <li>
                Limited technical and security information may be processed to
                operate the service, diagnose errors, enforce limits, and
                prevent abuse.
              </li>
              <li>
                Plan, subscription, checkout, payment-state, dispute-state,
                and question-usage records are processed to operate paid
                access. Payment details are collected by Whop, not by
                SneakSolve.
              </li>
            </ul>
          </section>

          <section id="use">
            <span>02</span>
            <h2>How we use information</h2>
            <p>
              We use this information to authenticate your account, connect the
              website with the extension, analyze submitted questions, return
              answers, maintain reliability, and protect SneakSolve against
              misuse. We do not currently sell personal information.
            </p>
          </section>

          <section id="sharing">
            <span>03</span>
            <h2>Service providers</h2>
            <p>
              SneakSolve relies on service providers to operate: Clerk for
              authentication and account management, Render for hosting and
              PostgreSQL storage, xAI for AI-based question analysis, and
              Whop for checkout, subscription, and payment
              administration. Information is shared with these providers only
              as needed for their role in delivering the service, and their
              own terms and privacy practices also apply.
            </p>
          </section>

          <section id="retention">
            <span>04</span>
            <h2>Storage and retention</h2>
            <p>
              SneakSolve is designed not to save captured screenshots as
              application records. Screenshots are transmitted for transient
              processing. Account information remains available through Clerk
              while your account exists. Billing records and question-usage
              counters are retained to administer plans and prevent duplicate
              charges; sanitized webhook event metadata and cryptographic
              hashes are retained temporarily for audit and replay protection.
              Raw payment webhook bodies are not retained as billing records.
              Limited operational or security records may also be kept when
              reasonably necessary.
            </p>
          </section>

          <section id="choices">
            <span>05</span>
            <h2>Your choices</h2>
            <p>
              You can review profile details, connected sign-in methods, and
              active sessions from the account page. You can sign out from the
              profile menu. Avoid including sensitive personal information in
              screenshots or custom instructions unless it is necessary.
            </p>
          </section>

          <section id="security">
            <span>06</span>
            <h2>Security</h2>
            <p>
              SneakSolve uses encrypted network connections, authenticated API
              requests, restricted website origins, and production account
              controls. No internet service can guarantee absolute security,
              but we maintain safeguards proportionate to the information the
              product processes.
            </p>
          </section>

          <section id="changes">
            <span>07</span>
            <h2>Policy changes and contact</h2>
            <p>
              This page will be updated as billing, referrals, data controls,
              and legal requirements are finalized. Material revisions will
              include a new update date. Privacy questions may be sent through
              the website Contact Us link.
            </p>
          </section>
        </div>
      </section>

      <aside className="policy-draft-note shell">
        <strong>This is a product-aligned working draft, not the final legal policy.</strong>
        <p>
          It should be reviewed and completed with qualified legal counsel
          before subscriptions become generally available.
        </p>
      </aside>
    </main>
  );
}
