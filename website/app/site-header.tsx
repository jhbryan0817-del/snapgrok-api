"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountNav } from "./account-nav";
import { BrandLogo } from "./brand-logo";

type HeaderItem = "pricing" | "use-cases" | "careers";

export function SiteHeader({ activeItem }: { activeItem?: HeaderItem }) {
  const [isCondensed, setIsCondensed] = useState(false);

  useEffect(() => {
    let frame = 0;

    const updateHeader = () => {
      frame = 0;
      const nextCondensed = window.scrollY > 48;
      setIsCondensed((current) => current === nextCondensed ? current : nextCondensed);
    };
    const scheduleHeaderUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener("scroll", scheduleHeaderUpdate, { passive: true });
    return () => {
      window.removeEventListener("scroll", scheduleHeaderUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className={`site-header shell${isCondensed ? " site-header-condensed" : ""}`}>
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
