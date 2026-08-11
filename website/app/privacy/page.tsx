import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Privacy Policy | Zenaian",
  description:
    "Learn how Zenaian handles account information, captured questions, extension sessions, usage records, and subscription data.",
};

export default function PrivacyPage() {
  return (
    <main className="info-page editorial-page privacy-policy-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader />

      <section className="editorial-hero legal-page-hero shell" aria-labelledby="privacy-policy-title">
        <span className="section-kicker">PRIVACY AT ZENAIAN</span>
        <h1 id="privacy-policy-title">Privacy Policy</h1>
        <p>
          This policy describes how the current Zenaian website, Chrome
          extension, AI-analysis service, account system, and Whop-powered
          subscriptions handle information.
        </p>
        <div className="policy-meta">
          <span>Working draft</span>
          <span>Updated August 10, 2026</span>
        </div>
      </section>

      <section className="policy-layout shell">
        <nav className="policy-index" aria-label="Privacy policy sections">
          <strong>On this page</strong>
          <a href="#scope">Scope and responsibility</a>
          <a href="#information">Information we handle</a>
          <a href="#extension">Extension and question data</a>
          <a href="#use">How we use information</a>
          <a href="#sharing">Service providers and disclosure</a>
          <a href="#retention">Storage and retention</a>
          <a href="#choices">Your choices and rights</a>
          <a href="#security">Security and international processing</a>
          <a href="#children">Children</a>
          <a href="#changes">Changes and contact</a>
        </nav>

        <div className="policy-content">
          <section id="scope">
            <span>01</span>
            <h2>Scope and responsibility</h2>
            <p>
              This policy applies to information handled by the operator of
              Zenaian through zenaian.com, the Zenaian Chrome extension, and
              the Zenaian API. Clerk, Render, xAI, Whop, Google, and other
              providers operate their own services under their own privacy
              notices. Where applicable law gives you privacy rights, the
              Zenaian operator is responsible for responding to requests about
              information under its control.
            </p>
          </section>

          <section id="information">
            <span>02</span>
            <h2>Information we handle</h2>
            <ul>
              <li>
                <strong>Account information.</strong> Clerk manages names,
                email addresses, profile images, sign-in methods, session
                identifiers, and account-security settings.
              </li>
              <li>
                <strong>Question content.</strong> When you deliberately start
                a capture, Zenaian handles the visible-tab screenshot or the
                area you selected, together with any optional custom
                instruction, to provide an answer.
              </li>
              <li>
                <strong>Extension information.</strong> The extension stores
                preferences and optional custom context locally in Chrome. It
                also stores rotating, expiring device-session credentials and
                short-lived operation state needed to authenticate captures
                and display results.
              </li>
              <li>
                <strong>Usage and service records.</strong> We process account
                identifiers, plan, quota and question-usage counters, request
                identifiers, timestamps, response status, error and security
                events, and extension-session expiration or revocation data.
              </li>
              <li>
                <strong>Subscription information.</strong> We receive Whop
                customer, checkout, membership, plan, renewal, cancellation,
                payment-state, refund and dispute identifiers needed to grant
                or remove access. Zenaian does not receive or store your full
                payment-card number.
              </li>
              <li>
                <strong>Technical information.</strong> Zenaian and its
                providers may automatically process IP address, browser or
                user-agent information, origin, request timing, and diagnostic
                data for delivery, security, fraud prevention, and reliability.
              </li>
            </ul>
          </section>

          <section id="extension">
            <span>03</span>
            <h2>Extension and question data</h2>
            <p>
              Zenaian captures page content only after you invoke a configured
              capture command. It is not designed to continuously record your
              screen or collect your browsing history. The captured image and
              optional instruction are sent over an encrypted connection to
              the Zenaian API and then to xAI for the requested analysis.
            </p>
            <p>
              Zenaian is designed not to save captured screenshots or custom
              instructions as application database records, and not to include
              them in ordinary application logs. They are held transiently in
              browser, server, and network memory while the request is created,
              transmitted, processed, completed, canceled, or timed out.
              Infrastructure and AI providers may process data under their own
              contracts, policies, security systems, and legally required
              retention practices.
            </p>
            <p>
              Unless our xAI account is configured for Zero Data Retention,
              xAI states that API inputs and outputs are encrypted at rest and
              retained for 30 days by default to audit suspected abuse or
              misuse. xAI may retain limited information longer where required
              for safety, security, compliance, or law. Provider practices can
              change and are governed by xAI&apos;s terms; review the current{" "}
              <a href="https://docs.x.ai/developers/faq/security" target="_blank" rel="noreferrer">
                xAI API security information
              </a>.
            </p>
            <p>
              Zenaian&apos;s use of information received from Google APIs will
              adhere to the Chrome Web Store User Data Policy, including its
              Limited Use requirements. We do not sell captured content or use
              it for personalized advertising.
            </p>
          </section>

          <section id="use">
            <span>04</span>
            <h2>How we use information</h2>
            <p>We use information only as reasonably necessary to:</p>
            <ul>
              <li>create, authenticate, secure, and support your account;</li>
              <li>pair the authorized extension and maintain device sessions;</li>
              <li>analyze submitted questions and return requested answers;</li>
              <li>administer plans, quotas, renewals, cancellations, and access;</li>
              <li>process and reconcile Whop billing and webhook events;</li>
              <li>diagnose failures, measure reliability, and improve the service;</li>
              <li>detect fraud, enforce the Terms, and protect users and systems; and</li>
              <li>comply with legal, accounting, tax, and regulatory obligations.</li>
            </ul>
            <p>
              Depending on your location and the activity, processing may be
              based on performing our agreement with you, legitimate interests
              in operating and securing the service, consent, or compliance
              with law. Where consent is the required basis, you may withdraw
              it prospectively, subject to legal and operational limitations.
            </p>
          </section>

          <section id="sharing">
            <span>05</span>
            <h2>Service providers and disclosure</h2>
            <p>
              We disclose information to providers only for their assigned
              operational purpose: Clerk for identity and account management;
              Render for application and PostgreSQL database hosting; xAI for AI analysis;
              Whop and its payment partners for checkout, subscriptions,
              payments, fraud controls, disputes, and tax administration; and
              Google for Chrome and Chrome Web Store distribution. These
              providers may process information under their own terms and
              privacy notices.
            </p>
            <p>
              We may also disclose information where reasonably necessary to
              comply with law or valid legal process, protect rights or safety,
              investigate security incidents, fraud, or prohibited conduct, or
              support a merger, financing, acquisition, reorganization, or sale
              of assets subject to appropriate confidentiality and legal
              safeguards. We do not sell personal information.
            </p>
          </section>

          <section id="retention">
            <span>06</span>
            <h2>Storage and retention</h2>
            <p>
              Captured screenshots and custom instructions are intended to be
              transient as described above. Local custom context remains in
              Chrome until you change it, clear it, remove the extension, or
              clear browser data. Clerk account information remains while your
              Clerk account exists, subject to Clerk&apos;s controls.
            </p>
            <p>
              Device-session, usage, membership, checkout, payment-state,
              webhook, audit, fraud-prevention, and security records may be
              retained for as long as reasonably needed to provide access,
              reconcile provider state, enforce limits, prevent replay or
              abuse, resolve disputes, and satisfy legal, accounting, or tax
              obligations. Records may remain longer in protected backups until
              their scheduled deletion. When information is no longer required,
              we will delete, de-identify, or securely isolate it where
              reasonably practicable and required by law.
            </p>
          </section>

          <section id="choices">
            <span>07</span>
            <h2>Your choices and rights</h2>
            <p>
              You can manage Clerk profile and security settings, sign out,
              clear optional custom context, remove the extension, cancel or
              reactivate an eligible subscription renewal, and choose not to
              submit a capture. Subject to applicable law and identity
              verification, you may request access, correction, deletion,
              portability, restriction, or objection regarding personal
              information under Zenaian&apos;s control. You may also have a
              right to complain to a local privacy regulator.
            </p>
            <p>
              Some requests may be limited where retention is required for
              transactions, security, fraud prevention, legal claims, or other
              legal obligations. Avoid capturing personal, confidential,
              health, financial, authentication, or other sensitive material
              unless you have authority to process it and it is necessary.
            </p>
          </section>

          <section id="security">
            <span>08</span>
            <h2>Security and international processing</h2>
            <p>
              Zenaian uses encrypted network connections, authenticated API
              requests, origin restrictions, rotating extension-bound sessions,
              server-authoritative quotas, signed billing webhooks, access
              controls, timeouts, and abuse protections. No system is perfectly
              secure, and we cannot guarantee that unauthorized access, loss,
              or misuse will never occur.
            </p>
            <p>
              Zenaian and its providers may process information in countries
              other than where you live. Where required, international
              transfers will rely on recognized contractual or legal
              safeguards. Contact us promptly if you believe your account or
              information has been compromised.
            </p>
          </section>

          <section id="children">
            <span>09</span>
            <h2>Children</h2>
            <p>
              Zenaian is not directed to children under 13, or any higher
              minimum age required by local law, and we do not knowingly seek
              their personal information. A user below the age of legal
              majority must have a parent or legal guardian review and approve
              use of the service and any purchase. Contact us if you believe a
              child has provided information without required authorization.
            </p>
          </section>

          <section id="changes">
            <span>10</span>
            <h2>Changes and contact</h2>
            <p>
              We may update this policy as the product, providers, and legal
              requirements change. Material changes will be identified by a
              revised update date and, where required, additional notice or
              consent. Privacy questions and requests may be sent to{" "}
              <a href="mailto:sneaksolve@gmail.com">sneaksolve@gmail.com</a>.
            </p>
          </section>
        </div>
      </section>

    </main>
  );
}
