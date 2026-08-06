import Link from "next/link";
import { AccountNav } from "./account-nav";
import { BrandLogo } from "./brand-logo";

type HeaderItem = "pricing" | "use-cases" | "careers";

export function SiteHeader({ activeItem }: { activeItem?: HeaderItem }) {
  return (
    <header className="site-header shell">
      <Link className="brand" href="/" aria-label="Zenaian home">
        <BrandLogo />
      </Link>

      <nav className="primary-nav" aria-label="Primary navigation">
        <Link className={activeItem === "pricing" ? "active" : ""} href="/pricing">Pricing</Link>
        <Link className={activeItem === "use-cases" ? "active" : ""} href="/use-cases">Use Cases</Link>
        <Link className={activeItem === "careers" ? "active" : ""} href="/careers">Careers</Link>
        <a href="mailto:sneaksolve@gmail.com">
          Contact Us
        </a>
      </nav>

      <AccountNav />
    </header>
  );
}
