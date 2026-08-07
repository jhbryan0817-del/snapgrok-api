import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Terms of Service | Zenaian",
  description:
    "Review the rules for using the Zenaian website, Chrome extension, AI analysis, accounts, and subscriptions.",
};

export default function TermsPage() {
  return (
    <main className="info-page terms-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader />

      <section className="policy-hero shell" aria-labelledby="terms-title">
        <span className="section-kicker">RULES FOR USING ZENAIAN</span>
        <h1 id="terms-title">Terms of Service</h1>
        <p>
          These Terms govern the Zenaian website, Chrome extension, account,
          AI-analysis service, usage allowances, and paid subscriptions.
        </p>
        <div className="policy-meta">
          <span>Working draft</span>
          <span>Updated August 7, 2026</span>
        </div>
      </section>

      <section className="policy-layout shell">
        <nav className="policy-index" aria-label="Terms of service sections">
          <strong>On this page</strong>
          <a href="#agreement">Agreement, age, and accounts</a>
          <a href="#service">Service and AI output</a>
          <a href="#acceptable-use">Acceptable use</a>
          <a href="#plans">Plans and allowances</a>
          <a href="#billing">Billing, cancellation, and refunds</a>
          <a href="#content">Your content and ownership</a>
          <a href="#third-parties">Third-party services</a>
          <a href="#termination">Suspension and termination</a>
          <a href="#disclaimers">Disclaimers and liability</a>
          <a href="#general">General terms and contact</a>
        </nav>

        <div className="policy-content">
          <section id="agreement">
            <span>01</span>
            <h2>Agreement, age, and accounts</h2>
            <p>
              By creating an account, installing the extension, purchasing a
              plan, or using Zenaian, you agree to these Terms and the Privacy
              Policy. You must be at least 13 years old, or any higher minimum
              age required where you live. If you are below the age of legal
              majority, a parent or legal guardian must review and approve
              these Terms, supervise your use, and authorize any purchase.
              Only a person legally able to enter the purchase may subscribe.
            </p>
            <p>
              You must provide accurate information and protect your sign-in
              methods and devices. You are responsible for activity under your
              account. Accounts, extension sessions, subscriptions, and usage
              allowances are personal, non-transferable, and may not be sold,
              shared, combined, or moved between accounts.
            </p>
          </section>

          <section id="service">
            <span>02</span>
            <h2>Service and AI output</h2>
            <p>
              Zenaian accepts a user-initiated screenshot of a visible Chrome
              tab or selected area and returns one or more proposed answers to
              a multiple-choice question. Optional custom context may be sent
              with the image. The service is intended to assist study and
              authorized review; it does not guarantee a correct answer.
            </p>
            <p>
              AI output can be inaccurate, incomplete, outdated, ambiguous, or
              unsuitable for a particular context. You must independently
              evaluate output and remain responsible for every decision and
              submission. Zenaian is not professional, legal, medical,
              financial, safety-critical, or academic-authority advice.
            </p>
            <p>
              We may modify models, prompts, interfaces, response formats,
              quotas, abuse controls, and availability. We do not promise
              uninterrupted operation, a particular response time, continued
              availability of a particular model, or compatibility with every
              page, browser setting, device, or assessment platform.
            </p>
          </section>

          <section id="acceptable-use">
            <span>03</span>
            <h2>Acceptable use</h2>
            <div className="policy-warning">
              <strong>Cheating with Zenaian is strictly prohibited.</strong>
              <p>
                Do not use Zenaian in an examination, quiz, assignment,
                certification, competition, interview, or other assessment
                when AI assistance or outside help is prohibited, restricted,
                undisclosed, or not expressly authorized.
              </p>
            </div>
            <p>
              Permitted uses include private study, self-created questions,
              memorization and review, practice materials, and assessments for
              which the responsible instructor, institution, employer, or
              organizer has clearly authorized AI assistance.
            </p>
            <p>You must not use, help others use, or attempt to use Zenaian to:</p>
            <ul>
              <li>
                violate law, an academic-integrity policy, honor code,
                workplace rule, assessment rule, certification requirement,
                contract, or another person&apos;s rights;
              </li>
              <li>
                bypass or interfere with proctoring, monitoring, access
                controls, device restrictions, paywalls, or security measures;
              </li>
              <li>
                impersonate another person, misrepresent authorship, obtain or
                distribute stolen assessment material, or commit fraud;
              </li>
              <li>
                access a device, account, network, file, or service without
                authorization;
              </li>
              <li>
                submit unlawful, infringing, abusive, malicious, or sensitive
                content that you lack authority to process;
              </li>
              <li>
                reverse engineer, scrape, resell, overload, automate abusive
                use of, or disrupt Zenaian; or
              </li>
              <li>
                evade authentication, origin controls, rate limits, quotas,
                payment controls, subscription restrictions, or enforcement.
              </li>
            </ul>
            <p>
              Misconduct can lead to academic, employment, certification,
              contractual, or platform consequences. Depending on the facts
              and jurisdiction, related conduct such as unauthorized access,
              impersonation, fraud, theft, or security circumvention may also
              violate civil or criminal law and may be reported or prosecuted.
            </p>
          </section>

          <section id="plans">
            <span>04</span>
            <h2>Plans and allowances</h2>
            <p>
              The Free plan currently provides 5 questions per day. Plus
              currently provides 200 questions for each monthly subscription
              period and uses Grok 4.3. Ultra currently provides 300 questions
              for each monthly subscription period and uses Grok 4.5. The
              account page is the authoritative record of your current plan,
              remaining questions, reset time, and paid period end.
            </p>
            <p>
              Unused questions expire at the applicable daily reset or paid
              period end, do not roll over, have no cash value, and cannot be
              transferred. A completed analysis normally consumes one question.
              Rate limits, concurrency controls, maintenance limits, and fraud
              protections are separate from subscription allowances.
            </p>
            <p>
              Only one paid plan may be active on a Zenaian account at a time.
              Zenaian does not currently support an in-period upgrade,
              downgrade, transfer, proration, or plan credit. To choose a
              different paid plan on the same account, cancel renewal and wait
              until the current paid entitlement expires.
            </p>
          </section>

          <section id="billing">
            <span>05</span>
            <h2>Billing, automatic renewal, cancellation, and refunds</h2>
            <p>
              Whop acts as the payment processor and merchant of record for
              checkout. Zenaian is the supplier of the subscription service.
              The price, billing interval, taxes, fees, and total charge are
              presented at checkout. Paid subscriptions start when payment is
              confirmed and renew automatically each month until canceled.
              By purchasing, you authorize the recurring charges displayed at
              checkout. Zenaian offers no free trial.
            </p>
            <p>
              You must cancel renewal before the next renewal time to avoid the
              next charge. Cancellation stops future renewal but does not
              ordinarily end the paid period already purchased. You retain any
              remaining paid allowance until period end unless access is
              suspended, terminated, refunded, reversed, disputed, or otherwise
              removed under these Terms, Whop&apos;s terms, or applicable law.
              Eligible canceled renewals may be reactivated before period end.
            </p>
            <div className="policy-warning">
              <strong>No free trial. No refunds except where required.</strong>
              <p>
                To the maximum extent permitted by law, all subscription
                charges are final and non-refundable, including for unused
                questions, partial periods, mistaken purchases, failure to
                cancel before renewal, dissatisfaction with AI output, or lack
                of use. We do not provide prorated refunds, credits, or cash
                value for remaining allowance.
              </p>
            </div>
            <p>
              This no-refund policy does not limit non-waivable consumer rights,
              card-network rights, or refunds or reversals required by law,
              Whop&apos;s binding terms, a confirmed duplicate or payment-processing
              error, fraud controls, or payment-network rules. If a payment
              fails, is refunded, reversed, disputed, or charged back, Zenaian
              may remove the affected entitlement immediately and return the
              account to the otherwise applicable plan. You remain responsible
              for valid unpaid amounts and consequences of a wrongful dispute.
            </p>
          </section>

          <section id="content">
            <span>06</span>
            <h2>Your content and Zenaian ownership</h2>
            <p>
              You retain any rights you have in question images and custom
              context you submit. You represent that you have permission and a
              lawful basis to capture and process that content. You grant
              Zenaian and its service providers a limited, worldwide license to
              host, transmit, reproduce, and process submitted content only as
              reasonably necessary to provide, secure, troubleshoot, and
              legally operate the requested service.
            </p>
            <p>
              Zenaian&apos;s software, design, branding, documentation, and service
              content are protected by intellectual-property laws. Subject to
              these Terms, we grant you a limited, personal, revocable,
              non-exclusive, non-sublicensable, and non-transferable right to
              use the service for its intended purpose. No ownership is
              transferred. Feedback may be used without obligation to you,
              provided it does not identify you publicly without permission.
            </p>
          </section>

          <section id="third-parties">
            <span>07</span>
            <h2>Third-party services</h2>
            <p>
              Clerk, Render, xAI, Whop, Google Chrome, and other providers
              operate under their own terms and policies. Their availability,
              decisions, and systems are outside Zenaian&apos;s direct control.
              Whop Buyer Terms also apply to purchases. Grok is a trademark of
              xAI. Zenaian is independent and is not affiliated with or endorsed
              by xAI, Google, Clerk, Render, or Whop.
            </p>
          </section>

          <section id="termination">
            <span>08</span>
            <h2>Suspension and termination</h2>
            <p>
              We may investigate, limit, suspend, or terminate access where
              reasonably necessary to secure the service, comply with law or
              provider requirements, address payment risk, prevent harm, or
              enforce these Terms. Serious or repeated cheating, fraud,
              security abuse, account sharing, automated abuse, or quota and
              billing circumvention may result in immediate termination.
            </p>
            <p>
              Suspension or termination for breach does not create a right to a
              refund except where mandatory law requires one. Provisions that
              by their nature should survive, including payment obligations,
              ownership, disclaimers, liability limitations, and dispute terms,
              remain effective after termination.
            </p>
          </section>

          <section id="disclaimers">
            <span>09</span>
            <h2>Disclaimers and limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Zenaian is provided
              &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without express or
              implied warranties, including warranties of accuracy,
              availability, merchantability, fitness for a particular purpose,
              non-infringement, or error-free operation. Mandatory warranties
              and consumer rights that cannot lawfully be excluded remain
              unaffected.
            </p>
            <p>
              To the maximum extent permitted by law, Zenaian and its operators
              will not be liable for indirect, incidental, special,
              consequential, exemplary, or punitive damages; loss of data,
              opportunity, revenue, or profits; academic, employment,
              certification, disciplinary, or legal consequences; or reliance
              on AI output. Where liability cannot be excluded, aggregate
              liability arising from Zenaian will not exceed the amount you
              paid directly for Zenaian during the twelve months before the
              event giving rise to the claim, unless applicable law requires a
              different remedy or amount.
            </p>
          </section>

          <section id="general">
            <span>10</span>
            <h2>General terms and contact</h2>
            <p>
              These Terms, the Privacy Policy, the plan description accepted at
              checkout, and applicable Whop buyer terms form the agreement for
              the service. If a provision is unenforceable, it will be limited
              to the minimum extent necessary and the remaining provisions will
              continue. A failure to enforce a provision is not a waiver. You
              may not assign these Terms or transfer access without written
              permission; the Zenaian operator may assign them in connection
              with a reorganization, financing, merger, acquisition, or sale.
            </p>
            <p>
              We may update these Terms prospectively as the product, providers,
              pricing, and law change. Material revisions will receive a new
              update date and any additional notice required by law. Changes do
              not retroactively remove non-waivable rights. Questions may be
              sent to{" "}
              <a href="mailto:sneaksolve@gmail.com">sneaksolve@gmail.com</a>.
            </p>
          </section>
        </div>
      </section>

      <aside className="policy-draft-note shell">
        <strong>This is a product-aligned working draft, not legal advice.</strong>
        <p>
          Before commercial launch, qualified counsel should add the legal
          operator&apos;s full identity and address, governing law, dispute forum,
          jurisdiction-specific consumer notices, and any required tax,
          withdrawal, auto-renewal, accessibility, or AI disclosures.
        </p>
      </aside>
    </main>
  );
}
