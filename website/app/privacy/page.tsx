import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Privacy Policy | Zenaian",
  description:
    "Learn how Zenaian currently handles account information, captured questions, and service data.",
};

export default function PrivacyPage() {
  return (
    <main className="info-page privacy-policy-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader />

      <section className="policy-hero shell" aria-labelledby="privacy-policy-title">
        <span className="section-kicker">PRIVACY AT ZENAIAN</span>
        <h1 id="privacy-policy-title">Privacy Policy</h1>
        <p>
          This policy explains how the current Zenaian website, Chrome
          extension, AI-analysis service, account system, and Whop-powered
          subscriptions process information.
        </p>
        <div className="policy-meta">
          <span>Working draft</span>
          <span>Updated August 4, 2026</span>
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
          <a href="#children">Children and international use</a>
          <a href="#security">Security</a>
          <a href="#changes">Policy changes</a>
        </nav>

        <div className="policy-content">
          <section id="information">
            <span>01</span>
            <h2>Information we process</h2>
            <p>
              Zenaian processes the information needed to provide the
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
                Extension-pairing and device-session records include account
                and Clerk session identifiers, the authorized extension ID,
                token versions, expiration and revocation times, and last-seen
                timestamps. Session secrets are protected and are not stored as
                reusable plaintext credentials.
              </li>
              <li>
                Plan, subscription, checkout, payment-state, dispute-state,
                and question-usage records are processed to operate paid
                access. Payment details are collected by Whop, not by
                Zenaian.
              </li>
              <li>
                Hosting, authentication, payment, and security providers may
                automatically process network and device information such as
                IP address, browser or user-agent information, request timing,
                and diagnostic events.
              </li>
            </ul>
          </section>

          <section id="use">
            <span>02</span>
            <h2>How we use information</h2>
            <p>
              We use this information to authenticate your account, connect the
              website with the extension, analyze submitted questions, return
              answers, administer plans and question allowances, reconcile
              subscriptions, maintain reliability, investigate errors, and
              protect Zenaian against fraud and misuse. We do not sell personal
              information or use captured question content for targeted
              advertising.
            </p>
          </section>

          <section id="sharing">
            <span>03</span>
            <h2>Service providers</h2>
            <p>
              Zenaian relies on service providers to operate: Clerk for
              authentication and account management, Render for hosting and
              PostgreSQL storage, xAI for AI-based question analysis, and
              Whop for checkout, subscription, and payment
              administration. Information is shared with these providers only
              as needed for their role in delivering the service, and their
              own terms and privacy practices also apply. We may also disclose
              information when reasonably necessary to comply with law,
              protect rights or safety, investigate abuse or fraud, or complete
              a business reorganization subject to appropriate safeguards.
            </p>
          </section>

          <section id="retention">
            <span>04</span>
            <h2>Storage and retention</h2>
            <p>
              Zenaian is designed not to save captured screenshots as
              application or database records. Screenshots and custom
              instructions are held only for transient analysis and are cleared
              from Zenaian&apos;s active analysis job after completion,
              cancellation, or timeout. xAI receives the submitted image and
              prompt to perform the requested analysis under its own data
              practices.
            </p>
            <p>
              Account information remains available through Clerk while your
              account exists. Extension pairing grants expire quickly; device
              sessions and related identifiers are retained until expiration,
              revocation, cleanup, or as reasonably needed for security.
              Billing memberships, checkout records, question-usage counters,
              and payment-state history are retained to administer access,
              reconcile Whop state, prevent duplicate charges, resolve
              disputes, and meet legal or accounting obligations. Sanitized
              webhook metadata and cryptographic hashes may be retained for
              audit and replay protection; raw payment webhook bodies are not
              retained as billing records.
            </p>
          </section>

          <section id="choices">
            <span>05</span>
            <h2>Your choices</h2>
            <p>
              You can review profile details, connected sign-in methods, and
              active sessions from the account page, sign out, cancel or
              reactivate an eligible renewal, and remove the Chrome extension.
              You may contact us to ask about applicable access, correction, or
              deletion rights. Some billing, fraud-prevention, security, and
              transaction records may need to be retained after an account is
              closed. Avoid including personal, confidential, or sensitive
              information in screenshots or custom instructions unless you
              have permission and it is necessary.
            </p>
          </section>

          <section id="children">
            <span>06</span>
            <h2>Children and international use</h2>
            <p>
              Zenaian is not directed to children under 13, and we do not
              knowingly collect their personal information. Users below the
              age of majority must have permission from a parent or legal
              guardian. Because our providers and infrastructure may operate in
              multiple countries, information can be processed outside your
              country of residence, subject to applicable safeguards and law.
            </p>
          </section>

          <section id="security">
            <span>07</span>
            <h2>Security</h2>
            <p>
              Zenaian uses encrypted network connections, authenticated API
              requests, extension-bound device sessions, restricted website
              origins, server-authoritative quotas, signed billing webhooks,
              and production account controls. No internet service can
              guarantee absolute security, but we maintain safeguards
              proportionate to the information the product processes. If you
              believe your account or data has been compromised, contact us
              promptly.
            </p>
          </section>

          <section id="changes">
            <span>08</span>
            <h2>Policy changes and contact</h2>
            <p>
              This page will be updated as data controls and legal requirements
              are finalized. Material revisions will include a new update date.
              Privacy questions and requests may be sent to{" "}
              <a href="mailto:sneaksolve@gmail.com">sneaksolve@gmail.com</a>.
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
