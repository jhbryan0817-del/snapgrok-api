import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Terms of Service | Zenaian",
  description:
    "The terms governing the Zenaian website, Chrome extension, generative-AI analysis, accounts, and subscriptions.",
};

export default function TermsPage() {
  return (
    <main className="info-page editorial-page terms-page">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <SiteHeader />

      <section className="editorial-hero legal-page-hero shell" aria-labelledby="terms-title">
        <span className="section-kicker">RULES FOR USING ZENAIAN</span>
        <h1 id="terms-title">Terms of Service</h1>
        <p>
          These Terms govern the Zenaian website, Chrome extension,
          generative-AI analysis, accounts, usage allowances, and paid
          subscriptions.
        </p>
        <div className="policy-meta">
          <span>Effective: [EFFECTIVE DATE]</span>
          <span>Last updated: August 14, 2026</span>
        </div>
      </section>

      <section className="policy-layout shell">
        <nav className="policy-index" aria-label="Terms of service sections">
          <strong>On this page</strong>
          <a href="#agreement">Agreement and eligibility</a>
          <a href="#service">Service and generative AI</a>
          <a href="#acceptable-use">Acceptable use</a>
          <a href="#plans">Plans and allowances</a>
          <a href="#billing">Billing, taxes, and renewal</a>
          <a href="#cancellation">Cancellation</a>
          <a href="#refunds">Refunds and withdrawal</a>
          <a href="#deletion">Account deletion</a>
          <a href="#content">Your content and privacy</a>
          <a href="#intellectual-property">Intellectual property</a>
          <a href="#termination">Suspension and termination</a>
          <a href="#third-parties">Third-party services</a>
          <a href="#liability">Disclaimers and liability</a>
          <a href="#law">Governing law and disputes</a>
          <a href="#changes">Changes and contact</a>
        </nav>

        <div className="policy-content">
          <section id="agreement">
            <span>01</span>
            <h2>Agreement and eligibility</h2>
            <p>
              These Terms govern your use of Zenaian, including
              www.zenaian.com, the Chrome extension, AI analysis, accounts and
              subscriptions. By creating an account, installing/using the
              extension or purchasing a plan, you agree to these Terms and the
              <Link href="/privacy"> Privacy Policy</Link>. You must be at least
              19 years old and legally able to enter this agreement.
            </p>
          </section>

          <section id="service">
            <span>02</span>
            <h2>Service and generative-AI notice</h2>
            <p>
              Zenaian uses generative artificial intelligence, including xAI
              Grok models, to analyze a user-initiated screenshot of a
              multiple-choice question and generate a proposed answer. This is
              advance notice that the service is operated using generative AI.
              While an answer result is displayed, the Chrome extension
              identifies it through the extension action hover text, for
              example &ldquo;AI-generated answer: B&rdquo; or
              &ldquo;AI-generated answers: A, C&rdquo;; inconclusive results
              are identified as AI-generated as well.
            </p>
            <p>
              AI output can be inaccurate, incomplete, outdated or unsuitable.
              You are responsible for deciding whether and how to use it.
              Zenaian is not professional legal, medical, financial,
              safety-critical, academic-authority or certification advice and
              does not guarantee answer accuracy, availability, response time
              or continued access to a particular model.
            </p>
          </section>

          <section id="acceptable-use">
            <span>03</span>
            <h2>Acceptable use</h2>
            <ul>
              <li>Do not use Zenaian for cheating or in any exam, quiz, assignment, certification, competition, interview or other assessment where AI/outside assistance is prohibited, restricted, undisclosed or not authorized.</li>
              <li>Do not bypass proctoring, monitoring, paywalls, security measures, access controls, rate limits, quotas or payment restrictions.</li>
              <li>Do not impersonate others, submit stolen assessment material, gain unauthorized access, commit fraud or use the service unlawfully.</li>
              <li>Do not intentionally submit identifiable sensitive personal information, authentication secrets, financial credentials or content you are not authorized to process.</li>
              <li>Do not resell, share or automate abusive use of accounts/subscriptions, reverse engineer except where mandatory law permits, or disrupt the service.</li>
            </ul>
            <div className="policy-warning">
              <strong>Sensitive-data warning</strong>
              <p>Do not submit screenshots containing identifiable sensitive personal information or credentials.</p>
            </div>
          </section>

          <section id="plans">
            <span>04</span>
            <h2>Plans and usage allowances</h2>
            <p>
              Plan descriptions, model availability and question allowances
              shown in the account/pricing interface at purchase are the
              current commercial terms for the plan. Unused allowance expires
              at the applicable reset/paid period, has no cash value and is
              not transferable. Rate limits and abuse controls are separate
              from subscription allowance.
            </p>
          </section>

          <section id="billing">
            <span>05</span>
            <h2>Billing, taxes and automatic renewal</h2>
            <p>
              Paid subscriptions are purchased through Whop. [LEGAL OPERATOR
              NAME] is the supplier of Zenaian. Whop provides payment services
              and acts in the limited merchant-of-record/tax capacities
              described in its then-current terms. Whop Buyer Terms also apply
              to your purchase.
            </p>
            <p>
              Subscriptions renew automatically at the billing interval shown
              at checkout until canceled. The product uses exclusive tax
              behavior, so applicable sales tax/VAT may be added on top of the
              displayed product price. Whop collects and remits supported
              transaction taxes where its service applies. The final amount,
              tax and renewal terms are shown at checkout before purchase.
            </p>
          </section>

          <section id="cancellation">
            <span>06</span>
            <h2>Cancellation</h2>
            <p>
              You may cancel future renewal from the Zenaian account interface
              when the subscription is eligible for cancellation. Ordinary
              cancellation stops future renewal and normally leaves
              already-paid Zenaian access through the current paid period.
              Account deletion is different: it immediately ends Zenaian
              access and unused allowance and requests cancellation of future
              renewal.
            </p>
          </section>

          <section id="refunds">
            <span>07</span>
            <h2>Refunds and statutory withdrawal rights</h2>
            <p>
              Except where mandatory law, a confirmed duplicate/processing
              error, binding payment-network rule or an express Zenaian offer
              requires otherwise, Zenaian does not voluntarily provide
              prorated refunds or cash credits merely because some
              subscription time or question allowance was unused.
            </p>
            <p>
              This rule does not limit non-waivable consumer rights. For Korean
              consumers, the E-Commerce Act generally provides a statutory
              withdrawal period under Article 17, subject to its statutory
              exceptions and required disclosures/measures. Where provision of
              a service or digital content has begun, a withdrawal limitation
              applies only to the extent the statutory conditions are
              satisfied; for divisible services/content, rights may remain for
              an unprovided portion. If the service differs from its
              advertisement or contract, the separate Article 17(3) remedy
              applies. Where a valid withdrawal/refund applies, Zenaian will
              process it within the period required by Article 18 and other
              mandatory law.
            </p>
            <p>
              Deleting your Zenaian account is not a waiver of a valid
              statutory withdrawal/refund right. A refund/withdrawal request
              should be made through the channel shown at checkout/account or
              <a href="mailto:privacy@zenaian.com"> privacy@zenaian.com</a> so
              it can be assessed independently of account deletion.
            </p>
          </section>

          <section id="deletion">
            <span>08</span>
            <h2>Account deletion</h2>
            <p>
              If you choose Delete Account and complete the required
              confirmations, your Zenaian access and unused allowance end
              immediately. Zenaian will revoke active service sessions,
              request cancellation of future renewal, delete ordinary
              account/service information, and retain only records that law
              requires us to preserve or narrow data temporarily required to
              complete the deletion/provider retry. Legally required records
              remain isolated until their statutory period expires.
            </p>
          </section>

          <section id="content">
            <span>09</span>
            <h2>Your content and privacy</h2>
            <p>
              You retain rights you have in content you submit. You represent
              that you are authorized to capture and process it. You grant
              Zenaian and its service providers a limited license to transmit
              and process the submitted content only as necessary to provide,
              secure and lawfully operate the requested service. The Privacy
              Policy explains the transient screenshot architecture and xAI ZDR.
            </p>
          </section>

          <section id="intellectual-property">
            <span>10</span>
            <h2>Intellectual property</h2>
            <p>
              Zenaian software, branding, interface and documentation are
              protected by applicable intellectual-property law. Subject to
              these Terms, Zenaian grants you a limited, personal,
              non-exclusive, non-transferable and revocable right to use the
              service for its intended purpose. No ownership is transferred.
            </p>
          </section>

          <section id="termination">
            <span>11</span>
            <h2>Suspension and termination</h2>
            <p>
              Zenaian may limit, suspend or terminate access where reasonably
              necessary for security, provider requirements, payment risk,
              legal compliance or enforcement of these Terms. Serious or
              repeated cheating, fraud, security abuse, account sharing,
              automated abuse or billing/quota circumvention may result in
              immediate termination. Mandatory consumer rights are not excluded.
            </p>
          </section>

          <section id="third-parties">
            <span>12</span>
            <h2>Third-party services</h2>
            <p>
              Zenaian depends on Clerk, Render, xAI, Whop, Google Chrome, and
              related infrastructure. Those services operate under their own
              terms and can experience outages or changes outside Zenaian&apos;s
              control. Zenaian is independent and is not endorsed by those
              providers.
            </p>
          </section>

          <section id="liability">
            <span>13</span>
            <h2>Disclaimers and liability</h2>
            <p>
              To the maximum extent permitted by law, Zenaian is provided
              &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; Mandatory
              warranties and remedies that cannot lawfully be excluded remain
              unaffected. To the maximum extent permitted by law, Zenaian is
              not liable for indirect, incidental, special or consequential
              loss, loss of opportunity/revenue,
              academic/employment/certification consequences, or decisions
              made in reliance on AI output. Where liability cannot be
              excluded, any contractual liability cap applies only to the
              extent lawful and does not limit mandatory consumer remedies.
            </p>
          </section>

          <section id="law">
            <span>14</span>
            <h2>Governing law and disputes</h2>
            <p>
              These Terms are governed by the laws of the Republic of Korea,
              without depriving a consumer of mandatory protections that
              applicable law does not permit the parties to waive.
              Jurisdiction and venue will be determined by applicable
              procedural/consumer law unless [LEGAL OPERATOR NAME] later
              publishes a lawful agreed forum clause reviewed for the target launch.
            </p>
          </section>

          <section id="changes">
            <span>15</span>
            <h2>Changes and contact</h2>
            <p>
              We may update these Terms prospectively. Material changes receive
              a revised date and any notice/acceptance required by law.
              Contact: [SUPPORT EMAIL] and <a href="mailto:privacy@zenaian.com">privacy@zenaian.com</a>.
              Operator details: [LEGAL OPERATOR NAME / ADDRESS / REGISTRATION].
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
