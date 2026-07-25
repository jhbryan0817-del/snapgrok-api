import Link from "next/link";
import { AccountNav } from "./account-nav";

type HeaderItem = "home" | "why" | "account" | "pricing";

export function SiteHeader({ activeItem }: { activeItem?: HeaderItem }) {
  return (
    <header className="site-header shell">
      <Link className="brand" href="/#top" aria-label="SneakSolve home">
        <img src="/sneaksolve-icons/default.png" alt="" />
        <span>SneakSolve</span>
      </Link>

      <nav className="primary-nav" aria-label="Primary navigation">
        <Link className={activeItem === "home" ? "active" : ""} href="/#top">Home</Link>
        <Link className={activeItem === "why" ? "active" : ""} href="/#why-sneaksolve">Why SneakSolve</Link>
        <Link className={activeItem === "account" ? "active" : ""} href="/account">Account</Link>
        <Link className={activeItem === "pricing" ? "active" : ""} href="/sign-up">Pricing</Link>
      </nav>

      <AccountNav />
    </header>
  );
}
