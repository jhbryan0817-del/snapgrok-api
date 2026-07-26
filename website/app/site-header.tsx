import Link from "next/link";
import { AccountNav } from "./account-nav";

type HeaderItem = "pricing" | "affiliate" | "privacy";

export function SiteHeader({ activeItem }: { activeItem?: HeaderItem }) {
  return (
    <header className="site-header shell">
      <Link className="brand" href="/#top" aria-label="SneakSolve home">
        <img src="/sneaksolve-icons/default.png" alt="" />
        <span>SneakSolve</span>
      </Link>
      <nav className="primary-nav" aria-label="Primary navigation">
        <Link className={activeItem === "pricing" ? "active" : ""} href="/pricing">
          Pricing
        </Link>
        <Link className={activeItem === "affiliate" ? "active" : ""} href="/affiliate">
          Affiliate Marketing
        </Link>
        <Link className={activeItem === "privacy" ? "active" : ""} href="/privacy">
          Privacy Policy
        </Link>
      </nav>
      <AccountNav />
    </header>
  );
}
