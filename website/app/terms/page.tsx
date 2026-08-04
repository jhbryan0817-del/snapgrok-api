import type { Metadata } from "next";
import { SiteHeader } from "../site-header";

export const metadata: Metadata = {
  title: "Terms of Service | Zenaian",
  description:
    "Review the rules that apply when you access the Zenaian website, extension, AI analysis, and subscriptions.",
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
          These terms govern access to the Zenaian website, Chrome extension,
          account features, AI analysis, and subscription services.
        </p>
        <div className="policy-meta">
          <span>Working draft</span>
          <span>Updated August 4, 2026</span>
        </div>
      </section>

      <section className="policy-layout shell">
        <nav className="policy-index" aria-label="Terms of service sections">
          <strong>On this page</strong>
          <a href="#agreement">Agreement and eligibility</a>
          <a href="#service">The service</a>
          <a href="#acceptable-use">Acceptable use</a>
          <a href="#plans">Plans and billing</a>
          <a href="#ownership">Ownership</a>
          <a href="#termination">Suspension and termination</a>
          <a href="#disclaimers">Disclaimers and liability</a>
          <a href="#changes">Changes and contact</a>
        </nav>

        <div className="policy-content">
          <section id="agreement">
            <span>01</span>
            <h2>Agreement and eligibility</h2>
            <p>
              By creating an account, installing the extension, purchasing a
              plan, or otherwise using Zenaian, you agree to these Terms and
              the Privacy Policy. You must be at least 13 years old and legally
              able to agree to these Terms. If you are under the age of
              majority where you live, a parent or legal guardian must approve
              your use and any purchase.
            </p>
            <p>
              You are responsible for accurate account information, activity
              under your account, and keeping your sign-in methods and devices
              secure. Accounts, extension sessions, subscriptions, and usage
              allowances may not be sold, transferred, or shared to evade plan
              limits.
            </p>
          </section>

          <section id="service">
            <span>02</span>
            <h2>The service and AI output</h2>
            <p>
              Zenaian analyzes user-submitted multiple-choice question images
              and returns one or more proposed answer choices. AI output can be
              incomplete, inaccurate, outdated, or inappropriate for the
              context. You must independently verify answers before relying on
              them. Zenaian is not a substitute for professional, medical,
              legal, financial, safety-critical, or other expert advice.
            </p>
            <p>
              We may update models, interfaces, limits, security controls, and
              service availability to maintain or improve the product. We do
              not promise uninterrupted access or a particular answer time.
            </p>
          </section>

          <section id="acceptable-use">
            <span>03</span>
            <h2>Acceptable use</h2>
            <div className="policy-warning">
              <strong>Any form of cheating using Zenaian is strictly prohibited.</strong>
              <p>
                Do not use Zenaian during an examination, quiz, assessment,
                competition, certification, interview, or assignment when AI
                assistance or outside help is prohibited or has not been
                expressly authorized.
              </p>
            </div>
            <p>
              Appropriate uses include private study, practice questions,
              memorization and review, self-created materials, and assessments
              where the instructor, institution, employer, or organizer has
              clearly permitted AI assistance.
            </p>
            <p>You must not use Zenaian to:</p>
            <ul>
              <li>
                violate an academic-integrity policy, honor code, workplace
                rule, certification rule, competition rule, contract, or law;
              </li>
              <li>
                bypass proctoring, monitoring, access controls, device
                restrictions, or other technical or procedural safeguards;
              </li>
              <li>
                impersonate another person, misrepresent work as your own,
                obtain or distribute stolen assessment content, or commit
                fraud;
              </li>
              <li>
                access any computer, account, file, network, or service without
                authorization;
              </li>
              <li>
                submit unlawful, infringing, abusive, malicious, or highly
                sensitive content, or content you do not have permission to
                process; or
              </li>
              <li>
                probe, reverse engineer, overload, automate abuse of, interfere
                with, or circumvent the security, authentication, quotas, or
                billing controls of Zenaian.
              </li>
            </ul>
            <p>
              Cheating commonly results in institutional, professional, or
              contractual discipline. Depending on the conduct and applicable
              jurisdiction, related acts such as unauthorized computer access,
              impersonation, fraud, theft, or circumvention of security
              controls may also constitute criminal activity and may lead to
              investigation or prosecution.
            </p>
          </section>

          <section id="plans">
            <span>04</span>
            <h2>Plans, usage, and billing</h2>
            <p>
              The current Free plan provides 5 questions per day. Plus provides
              200 questions per subscription billing period, and Ultra provides
              300 questions per subscription billing period. Allowances expire
              at their stated reset or period-end time and do not roll over.
              Successful analysis requests consume the allowance shown in your
              account. Abuse limits and temporary capacity controls are
              separate from plan allowances.
            </p>
            <p>
              Whop administers checkout, payment, and subscriptions. Paid plans
              renew automatically unless renewal is canceled. Canceling renewal
              preserves the remaining paid entitlement until its current period
              ends. If available through your account, renewal may be
              reactivated before the period ends.
            </p>
            <p>
              Plus and Ultra are separate subscriptions. Purchasing Ultra while
              Plus is active does not upgrade, credit, replace, or automatically
              cancel Plus; each subscription can renew independently until you
              cancel it. There is no free trial. Payments are non-refundable
              except where a refund is required by applicable law. A failed,
              reversed, refunded, disputed, or charged-back payment may remove
              the affected entitlement immediately, with access falling back to
              another valid plan or to Free.
            </p>
          </section>

          <section id="ownership">
            <span>05</span>
            <h2>Ownership and third-party services</h2>
            <p>
              Zenaian and its software, design, branding, and service content
              are protected by intellectual-property laws. These Terms grant a
              limited, personal, revocable, non-exclusive, non-transferable
              right to use the service as provided. They do not transfer
              ownership of Zenaian or third-party technology.
            </p>
            <p>
              Clerk, Render, xAI, Whop, Chrome, and other third-party services
              operate under their own terms and policies. Grok is a trademark
              of xAI. Zenaian is an independent product and is not affiliated
              with or endorsed by xAI.
            </p>
          </section>

          <section id="termination">
            <span>06</span>
            <h2>Suspension and termination</h2>
            <p>
              We may limit, suspend, or terminate access when reasonably needed
              to protect users or the service, comply with law, investigate
              suspected misuse, address payment problems, or enforce these
              Terms. Serious or repeated cheating, fraud, security abuse,
              account sharing, or quota circumvention may result in immediate
              termination. Sections that by their nature should survive will
              continue after termination.
            </p>
          </section>

          <section id="disclaimers">
            <span>07</span>
            <h2>Disclaimers and limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, Zenaian is provided “as
              is” and “as available,” without warranties of accuracy,
              availability, fitness for a particular purpose, non-infringement,
              or error-free operation. You remain responsible for how you use
              proposed answers and for complying with rules that apply to you.
            </p>
            <p>
              To the maximum extent permitted by law, Zenaian and its operators
              will not be liable for indirect, incidental, special,
              consequential, exemplary, or punitive damages, loss of data,
              academic or professional consequences, lost profits, or reliance
              on AI output. Mandatory consumer rights that cannot legally be
              excluded remain unaffected.
            </p>
          </section>

          <section id="changes">
            <span>08</span>
            <h2>Changes and contact</h2>
            <p>
              We may update these Terms as the product, billing arrangements,
              and legal requirements evolve. Material revisions will be posted
              with a new update date. Continued use after revised Terms take
              effect constitutes acceptance where permitted by law.
            </p>
            <p>
              Questions about these Terms may be sent to{" "}
              <a href="mailto:sneaksolve@gmail.com">sneaksolve@gmail.com</a>.
            </p>
          </section>
        </div>
      </section>

      <aside className="policy-draft-note shell">
        <strong>This is a product-aligned working draft, not final legal advice.</strong>
        <p>
          Qualified counsel should add the operating entity, governing law,
          venue, region-specific consumer terms, and final liability language
          before general commercial launch.
        </p>
      </aside>
    </main>
  );
}
