import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-content shell">
        <div className="footer-intro">
          <Link className="footer-brand" href="/" aria-label="Zenaian home">
            <BrandLogo compact />
          </Link>
          <p>Study smarter. Stay focused. Built for learners everywhere.</p>
        </div>

        <nav className="footer-nav" aria-label="Footer navigation">
          <Link href="/pricing">Pricing</Link>
          <Link href="/careers">Careers</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <a href="mailto:sneaksolve@gmail.com">Contact Us</a>
          <Link href="/account">Account</Link>
        </nav>

        <div className="footer-business-details" aria-label="Business information">
          <div className="footer-business-row">
            <p><strong>Business name</strong><span>[BUSINESS NAME]</span></p>
            <p><strong>Contact point</strong><span>[CONTACT POINT]</span></p>
          </div>
          <div className="footer-business-row">
            <p><strong>Business address</strong><span>[BUSINESS ADDRESS]</span></p>
            <p><strong>Business ID</strong><span>[BUSINESS ID]</span></p>
          </div>
        </div>

        <div className="site-footer-legal">
          <p>&copy; {new Date().getFullYear()} Zenaian. All rights reserved.</p>
          <p>
            Grok is a trademark of xAI. Zenaian is an independent product and
            is not affiliated with or endorsed by xAI.
          </p>
        </div>
      </div>
    </footer>
  );
}
