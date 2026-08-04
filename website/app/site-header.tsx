import Link from "next/link";
import { AccountNav } from "./account-nav";
import { BrandLogo } from "./brand-logo";

type HeaderItem = "pricing" | "privacy" | "contact";

export function SiteHeader({ activeItem }: { activeItem?: HeaderItem }) {
  return (
    <header className="site-header shell">
      <Link className="brand" href="/" aria-label="Zenaian home">
        <BrandLogo />
      </Link>

      <nav className="primary-nav" aria-label="Primary navigation">
        <Link className={activeItem === "pricing" ? "active" : ""} href="/pricing">Pricing</Link>
        <Link className={activeItem === "privacy" ? "active" : ""} href="/privacy">
          Privacy Policy
        </Link>
        <Link className={activeItem === "contact" ? "active" : ""} href="/contact">
          Contact Us
        </Link>
      </nav>

      <AccountNav />
    </header>
  );
}
