import Link from "next/link";
import { AccountNav } from "./account-nav";
import { BrandLogo } from "./brand-logo";

type HeaderItem = "pricing";

export function SiteHeader({ activeItem }: { activeItem?: HeaderItem }) {
  return (
    <header className="site-header shell">
      <Link className="brand" href="/" aria-label="Zenaian home">
        <BrandLogo />
      </Link>

      <nav className="primary-nav" aria-label="Primary navigation">
        <Link className={activeItem === "pricing" ? "active" : ""} href="/pricing">Pricing</Link>
        <span className="nav-placeholder" aria-disabled="true" title="Coming soon">Use Cases</span>
        <span className="nav-placeholder" aria-disabled="true" title="Coming soon">Careers</span>
        <a href="mailto:sneaksolve@gmail.com">
          Contact Us
        </a>
      </nav>

      <AccountNav />
    </header>
  );
}
