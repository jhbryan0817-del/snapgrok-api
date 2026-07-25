import Link from "next/link";
import { AccountNav } from "./account-nav";

export function SiteHeader() {
  return (
    <header className="site-header global-site-header">
      <Link className="brand" href="/#top" aria-label="SneakSolve home">
        <img src="/sneaksolve-icons/default.png" alt="" />
        <span>SneakSolve</span>
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/#top">Home</Link>
        <Link href="/#how-it-works">Why SneakSolve</Link>
        <Link href="/account">Account</Link>
        <Link href="/#pricing">Pricing</Link>
        <AccountNav />
      </nav>
    </header>
  );
}
