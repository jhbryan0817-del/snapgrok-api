import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-main shell">
        <Link className="footer-brand" href="/" aria-label="SneakSolve home">
          <img src="/sneaksolve-icons/default.png" alt="" />
          <span>
            <strong>SneakSolve</strong>
            <small>Ask in silence.</small>
          </span>
        </Link>

        <nav className="footer-nav" aria-label="Footer navigation">
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/account">Account</Link>
        </nav>
      </div>

      <div className="site-footer-legal shell">
        <p>&copy; {new Date().getFullYear()} SneakSolve. All rights reserved.</p>
        <p>
          Grok is a trademark of xAI. SneakSolve is an independent product and
          is not affiliated with or endorsed by xAI.
        </p>
      </div>
    </footer>
  );
}
