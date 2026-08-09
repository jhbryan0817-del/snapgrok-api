import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-main shell">
        <Link className="footer-brand" href="/" aria-label="Zenaian home">
          <BrandLogo compact />
        </Link>

        <nav className="footer-nav" aria-label="Footer navigation">
          <Link href="/pricing">Pricing</Link>
          <Link href="/use-cases">Use Cases</Link>
          <Link href="/careers">Careers</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <a href="mailto:sneaksolve@gmail.com">Contact Us</a>
          <Link href="/account">Account</Link>
        </nav>
      </div>

      <div className="site-footer-legal shell">
        <p>&copy; {new Date().getFullYear()} Zenaian. All rights reserved.</p>
        <p>
          Grok is a trademark of xAI. Zenaian is an independent product and
          is not affiliated with or endorsed by xAI.
        </p>
      </div>
    </footer>
  );
}
