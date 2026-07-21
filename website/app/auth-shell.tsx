import type { ReactNode } from "react";
import Link from "next/link";
import { AccountNav } from "./account-nav";

export function AuthShell({
  eyebrow,
  title,
  description,
  mode,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  mode: "sign-in" | "sign-up";
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-aurora auth-aurora-one" aria-hidden="true" />
      <div className="auth-aurora auth-aurora-two" aria-hidden="true" />
      <header className="auth-header">
        <Link className="brand" href="/" aria-label="SnapGrok home">
          <img src="/snapgrok-icons/default.png" alt="" />
          <span>SnapGrok</span>
        </Link>
        <AccountNav />
      </header>

      <section className="auth-layout">
        <div className="auth-copy">
          <span className="section-kicker">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>

          <div className="auth-proof-card">
            <div className="auth-proof-icon" aria-hidden="true">S</div>
            <div>
              <strong>One account, across SnapGrok.</strong>
              <p>Sign in on the website, then reopen the Chrome extension to continue securely.</p>
            </div>
          </div>

          <div className="auth-assurance" aria-label="Security highlights">
            <div><span aria-hidden="true">01</span><p>Identity and sessions are secured by Clerk.</p></div>
            <div><span aria-hidden="true">02</span><p>Secret API keys stay on the server.</p></div>
            <div><span aria-hidden="true">03</span><p>You can review sessions or sign out at any time.</p></div>
          </div>
        </div>

        <div className="auth-card-frame">
          <div className="auth-mode-switch" aria-label="Choose an account action">
            <a className={mode === "sign-in" ? "active" : ""} href="/account?mode=sign-in">Log in</a>
            <a className={mode === "sign-up" ? "active" : ""} href="/account?mode=sign-up">Sign up</a>
          </div>
          <div className="clerk-surface">{children}</div>
          <p className="auth-footnote">Protected account access · Powered by Clerk</p>
        </div>
      </section>
    </main>
  );
}
