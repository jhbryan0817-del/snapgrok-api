import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-content shell">
        <div className="site-footer-top">
          <Link className="footer-brand" href="/" aria-label="Zenaian home">
            <BrandLogo compact />
          </Link>

          <nav className="footer-nav" aria-label="Footer navigation">
            <Link href="/pricing">Pricing</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <a href="mailto:sneaksolve@gmail.com">Contact Us</a>
            <Link href="/account">Account</Link>
          </nav>
        </div>

        <div className="footer-business-details" aria-label="Business information">
          <div className="footer-business-row">
            <p><strong>Business Name</strong><span>제나이안 (Zenaian)</span></p>
            <p><strong>Registration Number</strong><span>532-11-03077</span></p>
            <p><strong>Contact Point</strong><span>info@zenaian.com</span></p>
          </div>
          <div className="footer-business-row">
            <p><strong>Business Address</strong><span>101-904, 136 Hongjaechun-ro, Seodaemun-gu, Seoul, South Korea</span></p>
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
