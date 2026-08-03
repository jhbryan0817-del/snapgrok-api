import Link from "next/link";
import { BrandLogo, BrandName } from "./brand-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-main shell">
        <Link className="footer-brand" href="/" aria-label="Zenaian home">
          <BrandLogo compact />
          <span>
            <strong><BrandName /></strong>
            <small>Stay focused.</small>
          </span>
        </Link>

        <nav className="footer-nav" aria-label="Footer navigation">
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/contact">Contact Us</Link>
          <Link href="/account">Account</Link>
        </nav>
      </div>

      <div className="site-footer-legal shell">
        <p>&copy; {new Date().getFullYear()} <BrandName />. All rights reserved.</p>
        <p>
          Grok is a trademark of xAI. <BrandName /> is an independent product and
          is not affiliated with or endorsed by xAI.
        </p>
      </div>
    </footer>
  );
}
