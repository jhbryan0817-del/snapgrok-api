import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Privacy Policy | Zenaian",
  description:
    "How Zenaian handles account information, screenshots, extension sessions, usage records, subscriptions, retention, and privacy requests.",
};

const transferRows = [
  {
    recipient: "Render Services, Inc.",
    location: "United States - Virginia",
    information:
      "Account identifiers, extension-session/usage/billing metadata; transient screenshot/instruction in server RAM",
    purpose: "API and PostgreSQL hosting, security and recovery",
    timing: "At service requests / continuous hosting over encrypted connections",
    retention:
      "Zenaian schedule; native logs up to 30 days depending plan; database recovery copies roll for the provider plan window.",
  },
  {
    recipient: "Clerk, Inc.",
    location: "United States; Clerk/subprocessors may process where they operate",
    information:
      "Email/name/account identifiers, authentication/session/security information",
    purpose: "Authentication and account management",
    timing: "Signup/login/session/account operations",
    retention:
      "Account lifetime and provider security/legal lifecycle; Zenaian initiates Clerk user deletion when account deletion completes.",
  },
  {
    recipient: "X.AI LLC",
    location:
      "United States; xAI public subprocessor list is mainly US and includes a UK support subsidiary",
    information:
      "Transient screenshot, instruction/prompt and generated result; incidental ordinary personal information may appear",
    purpose: "Generative-AI inference",
    timing: "Each deliberate capture over encrypted API",
    retention: "Zero Data Retention for User Content in production.",
  },
  {
    recipient: "Whop, Inc. and payment/tax partners",
    location: "United States and other locations used by Whop/partners",
    information:
      "Whop directly collects buyer/payment/tax data at checkout. Zenaian sends provider-native checkout/membership/payment identifiers and subscription commands, and receives minimum transaction/access state. Whop may also share limited purchase/contact/profile information with Zenaian as seller under its own data-sharing/privacy terms.",
    purpose: "Checkout, recurring billing, tax handling where supported, refunds/disputes",
    timing: "At checkout and subscription lifecycle",
    retention:
      "Provider/legal retention. Zenaian retains only the minimized operational and statutory records described here.",
  },
  {
    recipient: "Google Workspace / Google LLC",
    location:
      "[PLANNED CONFIGURATION: United States for covered data at rest; service/support processing may occur in countries on Google's current subprocessor list]",
    information: "Privacy/support emails you choose to send",
    purpose: "Privacy/support communications",
    timing: "When you email privacy@zenaian.com",
    retention:
      "Ordinary closed privacy email target: 365 days; minimized statutory complaint record separately where required.",
  },
] as const;

const retentionRows = [
  ["Screenshot / instruction", "No persistent application storage; transient until completion/cancel/timeout."],
  ["AI answer/result job", "Brief polling window, normally about 2 minutes after completion."],
  ["Pairing grants", "Minutes; expired/consumed cleanup normally within about 1 hour."],
  ["Extension device session", "Active credential lifetime (currently up to 30 days) plus short ordinary cleanup; deleted immediately on account deletion."],
  ["Per-analysis quota operation", "30 days after settlement."],
  ["Usage-period summary", "90 days after the period ends."],
  ["Failed/expired checkout", "7 days; consumed checkout operational record 30 days."],
  ["Sanitized Whop webhook/provider event", "30 days."],
  ["Terminal live membership", "Up to 90 days where needed for reconciliation; deleted sooner on account deletion."],
  ["Live user-facing payment history", "Up to 12 months while the account exists; legally required transaction copy is separately archived."],
  ["Render logs", "Provider-native 7/14/30-day retention depending workspace plan; Zenaian does not stream launch logs to a third-party log warehouse."],
  ["Legally required contract/withdrawal records", "5 years where the Korean E-Commerce Act applies."],
  ["Legally required payment/supply records", "5 years where the Korean E-Commerce Act applies."],
  ["Consumer complaint/dispute records", "3 years where the Korean E-Commerce Act applies."],
  ["Privacy-request audit", "1 year after completion, unless an actual dispute/legal duty requires longer."],
  ["Ordinary privacy mailbox message", "Target 365 days after receipt; legally required complaint facts are minimized and stored separately."],
] as const;

export default function PrivacyPage() {
  return (
    <main className="info-page editorial-page privacy-policy-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader activeItem="privacy" />

      <section className="editorial-hero legal-page-hero shell" aria-labelledby="privacy-policy-title">
        <span className="section-kicker">PRIVACY AT ZENAIAN</span>
        <h1 id="privacy-policy-title">Privacy Policy</h1>
        <p>
          This policy explains how Zenaian processes information across the
          website, Chrome extension, API, accounts, subscriptions, and
          privacy-support communications.
        </p>
        <div className="policy-meta">
          <span>Effective: [EFFECTIVE DATE]</span>
          <span>Last updated: August 14, 2026</span>
        </div>
      </section>

      <section className="policy-layout shell">
        <nav className="policy-index" aria-label="Privacy policy sections">
          <strong>On this page</strong>
          <a href="#scope">Who we are and scope</a>
          <a href="#information">Personal information</a>
          <a href="#legal-bases">Legal bases</a>
          <a href="#screenshots">Screenshot processing</a>
          <a href="#use">Why we use information</a>
          <a href="#providers">Providers and transfers</a>
          <a href="#whop">Whop checkout and taxes</a>
          <a href="#retention">Retention</a>
          <a href="#deletion">Account deletion</a>
          <a href="#rights">Your rights and requests</a>
          <a href="#security">Security and incidents</a>
          <a href="#age">Age</a>
          <a href="#changes">Changes and contact</a>
        </nav>

        <div className="policy-content">
          <section id="scope">
            <span>01</span>
            <h2>Who we are and scope</h2>
            <p>
              Zenaian is operated by [LEGAL OPERATOR NAME], [LEGAL FORM],
              Republic of Korea, with address [KOREAN BUSINESS ADDRESS].
              Privacy contact: <a href="mailto:privacy@zenaian.com">privacy@zenaian.com</a>.
              Privacy responsible person / CPO: [NAME / TITLE / CONTACT].
            </p>
            <p>
              This Privacy Policy applies to www.zenaian.com, the Zenaian
              Chrome extension, the Zenaian API, account and subscription
              functions, and privacy-support communications. Zenaian is
              designed and operated from Korea and uses the Personal
              Information Protection Act of Korea (&ldquo;PIPA&rdquo;) as its
              primary privacy baseline.
            </p>
            <p>
              Zenaian does not use third-party behavioral analytics, cross-site
              advertising trackers, advertising profiles or sale of personal
              information. The public website is offered in English; the
              service does not intentionally target a particular foreign region.
            </p>
          </section>

          <section id="information">
            <span>02</span>
            <h2>Personal information we process</h2>
            <ul>
              <li><strong>Account information:</strong> Clerk user identifier, email address, name/display name, sign-in/account-security information and session state needed for authentication.</li>
              <li><strong>Extension information:</strong> local custom instruction/preferences, local rotating device credentials, and server-side pairing/device-session identifiers and timestamps.</li>
              <li><strong>Question content:</strong> only when you deliberately activate a capture, the visible screenshot or selected screen region and an optional instruction are processed to generate an answer.</li>
              <li><strong>Usage information:</strong> plan, quota period, usage counts, operation identifiers, model identifier, status and limited timestamps needed to enforce allowances and prevent duplicate charging/usage.</li>
              <li><strong>Subscription information:</strong> Whop checkout, membership, product/plan, renewal/cancellation, payment/refund/dispute identifiers and minimum payment-state information needed to grant access, support transactions and comply with law. Zenaian does not store full payment-card numbers.</li>
              <li><strong>Operational/security information:</strong> request identifier, request method/path/status, safe error codes, timing and limited security events. We do not intentionally put screenshots, prompts, answers or authentication tokens in application logs.</li>
              <li><strong>Privacy/support information:</strong> information you choose to include when contacting privacy@zenaian.com and minimal records showing how a privacy request or consumer complaint was handled.</li>
            </ul>
          </section>

          <section id="legal-bases">
            <span>03</span>
            <h2>Legal bases under Korean PIPA</h2>
            <p>
              The following quotations are Zenaian&apos;s working English
              translations of the relevant Korean statutory clauses for user
              readability. The Korean statutory text controls.
            </p>
            <ul>
              <li>PIPA Article 15(1)(4) permits processing where it is &ldquo;necessary to perform a contract concluded with the data subject, or to take measures requested by the data subject in the process of concluding a contract.&rdquo; Zenaian relies on this for account/authentication, requested screenshot analysis, usage allowances, subscription access and ordinary account support.</li>
              <li>PIPA Article 15(1)(6) permits processing where it is &ldquo;necessary to achieve the controller&apos;s legitimate interests and those interests clearly take precedence over the data subject&apos;s rights,&rdquo; provided the interest is substantially related and the processing remains within a reasonable scope. Zenaian relies on this narrowly for security, rate limiting, replay prevention, fraud/abuse prevention and short diagnostics.</li>
              <li>PIPA Article 15(1)(2) permits processing &ldquo;where there is a special statutory provision, or processing is unavoidable in order to comply with a legal obligation.&rdquo; Zenaian relies on this for transaction/complaint records that Korean law requires us to preserve and for other concrete legal duties.</li>
              <li>PIPA Article 21 requires personal information to be destroyed without delay when it becomes unnecessary because its retention period has expired or its purpose has been achieved. When another law requires continued retention, Article 21 requires that retained information be stored and managed separately. Zenaian therefore separates legally retained transaction records from ordinary live account data.</li>
              <li>PIPA Article 23 generally restricts processing of sensitive personal information unless a specific statutory exception applies. Zenaian is not designed to collect sensitive personal information and prohibits intentional submission of identifiable sensitive personal information in captures or instructions.</li>
              <li>PIPA Article 28-8 governs overseas provision, processing outsourcing and storage. Where overseas outsourcing/storage is necessary to perform the service, Zenaian uses the contract-performance route in Article 28-8(1)(3) and publishes the prescribed transfer information below.</li>
            </ul>
          </section>

          <section id="screenshots">
            <span>04</span>
            <h2>Screenshot processing, sensitive information and xAI ZDR</h2>
            <p>
              Zenaian captures screen content only after you deliberately
              invoke a configured capture action. It is not designed to
              continuously record your screen, collect browsing history, or
              build a history of questions you view.
            </p>
            <p>
              The captured image and optional instruction are transmitted over
              encrypted connections to the Zenaian API in Virginia, United
              States, and then to xAI for the requested generative-AI
              inference. Zenaian does not save the screenshot, instruction,
               question text or AI answer as a persistent application database
              record. The server clears the sensitive request body after
               completion, cancellation or timeout, and completed result state
              is retained only briefly for polling.
            </p>
            <p>
              Our production xAI team is configured for Zero Data Retention
              (ZDR). xAI states that ZDR User Content is processed transiently
              and not retained as a durable content copy after processing under
              its current enterprise terms. Zenaian also verifies the xAI ZDR
              response header in production and is designed not to fall back to
              ordinary-retention inference if ZDR is not confirmed.
            </p>
            <div className="policy-warning">
              <strong>Protect sensitive information.</strong>
              <p>Do not submit screenshots containing identifiable sensitive personal information or credentials.</p>
            </div>
            <p>
              Do not intentionally submit identifiable sensitive personal
              information, such as an identifiable person&apos;s medical/health
              record, political or religious information, sexual-life
              information, biometric/unique identifiers, authentication
              secrets, financial credentials, or other highly sensitive
              material. If such material is accidentally included, Zenaian&apos;s
              design is to process it only transiently through the requested
              ZDR inference path rather than create a persistent profile or history.
            </p>
          </section>

          <section id="use">
            <span>05</span>
            <h2>Why we use information</h2>
            <ul>
              <li>create, authenticate, secure and support your account;</li>
              <li>pair and authenticate the extension;</li>
              <li>perform the screenshot analysis you request and return the answer;</li>
              <li>administer plan limits and prevent duplicate usage;</li>
              <li>create and reconcile subscriptions, payments, renewal cancellation, refunds and disputes;</li>
              <li>prevent abuse, secure the service and diagnose failures using minimized operational information;</li>
              <li>respond to privacy/consumer requests; and</li>
              <li>comply with transaction-retention, accounting, tax, consumer-protection and other legal duties.</li>
            </ul>
          </section>

          <section id="providers">
            <span>06</span>
            <h2>Service providers and international processing</h2>
            <p>
              Zenaian uses service providers only for defined operational
              purposes. We do not sell captured content or personal
              information. Overseas transfer details are as follows:
            </p>
            <div className="policy-table-wrap" role="region" aria-label="Overseas transfer details" tabIndex={0}>
              <table className="policy-table policy-transfer-table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Country/location</th>
                    <th>Information</th>
                    <th>Purpose</th>
                    <th>Timing/method</th>
                    <th>Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {transferRows.map((row) => (
                    <tr key={row.recipient}>
                      <th scope="row">{row.recipient}</th>
                      <td>{row.location}</td>
                      <td>{row.information}</td>
                      <td>{row.purpose}</td>
                      <td>{row.timing}</td>
                      <td>{row.retention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Domestic website hosting: www.zenaian.com is hosted through
              Hosting.kr / Megazone Co., Ltd. in the Republic of Korea.
              Hosting.kr describes its Linux hosting as AWS-based. On the
              current evidence, Zenaian treats this as domestic entrusted
              processing rather than a Zenaian overseas transfer. The host
              receives ordinary website requests and provider-native
              access/security logs; Zenaian does not place its account
              database, screenshot analysis data, or behavioral analytics on
              the website host. Visitor-statistics packages and raw-log
              archiving are disabled by Zenaian by default.
            </p>
            <p>
              For the overseas processors above, Zenaian relies on PIPA Article
              28-8(1)(3) where the processing outsourcing or storage is
              necessary to conclude or perform our service contract and the
              information required by Article 28-8(2) is published here. If you
              choose not to use the overseas processing required for account
              authentication, API hosting or AI inference, we cannot provide
              the corresponding core service. You may avoid further capture
              processing at any time by not invoking a capture and may delete
              your account as described below.
            </p>
          </section>

          <section id="whop">
            <span>07</span>
            <h2>Whop checkout and taxes</h2>
            <p>
              Paid subscriptions are checked out through Whop. The product uses
              exclusive tax behavior: the product price is shown before tax
              and Whop may add applicable sales tax or VAT at checkout based on
              the transaction. Zenaian has selected Whop&apos;s Collects and
              Remits mode for supported jurisdictions. Whop&apos;s current Seller
              Terms state that Whop&apos;s merchant-of-record role is limited to
              payment/card-network settlement and, in Collects and Remits
              jurisdictions, specified transaction taxes; Zenaian remains the
              supplier responsible for the product, consumer obligations and
              taxes outside the scope Whop actually handles. Whop&apos;s Seller
              Terms also incorporate a Seller Data Sharing Addendum governing
              personal-data sharing between Whop and sellers. Whop&apos;s Privacy
              Policy states that it may share purchase confirmation, username,
              contact and certain account-profile information with the
              relevant seller to complete a purchase.
            </p>
            <p>
              For new production checkouts, Zenaian is designed to send no
              Zenaian user-identifying custom metadata to Whop. Whop collects
              buyer/payment information directly under its own terms and may
              share limited purchase/contact/profile information with Zenaian
              as the seller where necessary to complete the purchase. Zenaian
              maps provider events using Whop&apos;s checkout_configuration_id
              and other provider-native checkout/membership/payment
              identifiers, and stores only the fields reasonably necessary for
              service access, support and legal records. Whop may independently
              retain its buyer/payment/tax records according to its own legal
              obligations; Zenaian account deletion cannot erase records Whop
              independently must keep.
            </p>
          </section>

          <section id="retention">
            <span>08</span>
            <h2>Retention</h2>
            <div className="policy-table-wrap" role="region" aria-label="Retention schedule" tabIndex={0}>
              <table className="policy-table policy-retention-table">
                <thead><tr><th>Category</th><th>Retention</th></tr></thead>
                <tbody>
                  {retentionRows.map(([category, retention]) => (
                    <tr key={category}>
                      <th scope="row">{category}</th>
                      <td>{retention}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Korean e-commerce rules also require certain advertising records
              to be preserved for six months. Zenaian can satisfy this through
              versioned offer/pricing records without attaching them to
              individual users.
            </p>
          </section>

          <section id="deletion">
            <span>09</span>
            <h2>Account deletion</h2>
            <p>
              You can request account deletion from the authenticated account
              page. Before deletion, we require explicit confirmations
              explaining its consequences. Once confirmed, Zenaian immediately
              blocks further service use, cancels in-flight analysis where
              possible, revokes extension sessions, removes your Zenaian
              entitlement, requests cancellation of future Whop renewal,
              separates any transaction information that must be preserved by
              law, deletes ordinary Zenaian account/usage/billing records, and
              deletes the Clerk user account.
            </p>
            <p>
              Our engineering target is to initiate deletion immediately and
              normally complete deletion from active systems under Zenaian&apos;s
              control within 24 hours. This target does not mean every provider
              recovery copy or legally required record is physically erased
              within 24 hours. Narrow statutory records remain isolated until
              their legal retention period expires, and rolling provider
              recovery copies age out according to the provider&apos;s recovery
              schedule. If a database recovery copy is restored, Zenaian
              reapplies completed deletion records before reopening the
              restored system to production.
            </p>
            <p>
              Account deletion ends remaining Zenaian access and unused
              question allowance immediately. It requests cancellation of
              future renewal but is not itself a request for a refund and does
              not waive any mandatory withdrawal/refund right you have under
              applicable law.
            </p>
          </section>

          <section id="rights">
            <span>10</span>
            <h2>Your rights and requests</h2>
            <p>
              Subject to applicable law, you may request access, correction,
              deletion, suspension of processing/withdrawal where applicable,
              and information about processing under Zenaian&apos;s control. The
              account page provides a human-readable privacy view and JSON
              export, plus account deletion. You may also contact <a href="mailto:privacy@zenaian.com">privacy@zenaian.com</a>.
            </p>
            <p>
              We use proportionate identity verification. Normally, an
              authenticated account is sufficient. We do not ask for a
              passport or government ID merely because you make a privacy
              request. Where deletion or correction is restricted by a
              specific legal retention duty, we will explain the basis and
              continue to isolate the retained record from ordinary service use.
            </p>
          </section>

          <section id="security">
            <span>11</span>
            <h2>Security and incident handling</h2>
            <p>
              Zenaian uses encrypted connections, production authentication,
              exact-origin controls, rotating extension credentials,
              server-authoritative quotas, signed billing webhooks, bounded
              request sizes/timeouts, database access controls and data
              minimization. No online service can guarantee absolute security.
            </p>
            <p>
              If a qualifying personal-information leak occurs, Zenaian follows
              the notice/reporting duties under Korean law, including the
              current 72-hour rules where applicable.
            </p>
          </section>

          <section id="age">
            <span>12</span>
            <h2>Age</h2>
            <p>
              Zenaian is available only to users who are at least 19 years old.
              We do not intentionally offer accounts or paid subscriptions to
              persons under 19. If we learn that an under-19 person created an
              account contrary to this requirement, we may suspend/delete it
              and handle any legally required consumer/privacy steps.
            </p>
          </section>

          <section id="changes">
            <span>13</span>
            <h2>Changes and contact</h2>
            <p>
              We may update this policy when the service, providers, law or
              data practices change. Material changes will be identified by a
              revised date and any notice/consent required by law. Contact: <a href="mailto:privacy@zenaian.com">privacy@zenaian.com</a>.
              Operator: [LEGAL OPERATOR NAME / ADDRESS / BUSINESS REGISTRATION].
              Privacy responsible person: [CPO DETAILS].
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
