"use client";

import { SignIn, SignUp, UserProfile, useUser } from "@clerk/react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { AccountNav } from "../account-nav";
import { AuthShell } from "../auth-shell";

type AccountMode = "sign-in" | "sign-up";
function requestedMode(): AccountMode {
  if (typeof window === "undefined") return "sign-in";
  return new URLSearchParams(window.location.search).get("mode") === "sign-up" ? "sign-up" : "sign-in";
}
function subscribeToModeChange(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const mode = useSyncExternalStore(subscribeToModeChange, requestedMode, () => "sign-in" as AccountMode);
  if (!isLoaded) {
    return <main className="account-loading-page"><div className="account-loading-mark"><img src="/sneaksolve-icons/default.png" alt="" /><span>Loading your SneakSolve account…</span></div></main>;
  }
  if (!isSignedIn) {
    return (
      <AuthShell
        eyebrow={mode === "sign-up" ? "JOIN SNEAKSOLVE" : "WELCOME BACK"}
        title={mode === "sign-up" ? "Create your account. Keep every session secure." : "Welcome back. Pick up where you left off."}
        description={mode === "sign-up" ? "Create one secure identity for the SneakSolve website, Chrome extension, and analysis API." : "Sign in on the website, then open SneakSolve. Your authenticated session syncs through Clerk."}
        mode={mode}
      >
        {mode === "sign-up" ? (
          <SignUp routing="hash" signInUrl="/account?mode=sign-in" forceRedirectUrl="/account" fallbackRedirectUrl="/account" />
        ) : (
          <SignIn routing="hash" signUpUrl="/account?mode=sign-up" forceRedirectUrl="/account" fallbackRedirectUrl="/account" />
        )}
      </AuthShell>
    );
  }
  const name = user?.firstName || user?.fullName || "there";
  const email = user?.primaryEmailAddress?.emailAddress || "Signed-in account";
  return (
    <main className="account-page">
      <div className="account-aurora" aria-hidden="true" />
      <header className="account-header">
        <Link className="brand" href="/" aria-label="SneakSolve home"><img src="/sneaksolve-icons/default.png" alt="" /><span>SneakSolve</span></Link>
        <nav className="account-header-nav" aria-label="Account navigation"><Link href="/">Back to website</Link><AccountNav /></nav>
      </header>
      <section className="account-welcome">
        <div><span className="section-kicker">YOUR SNEAKSOLVE ACCOUNT</span><h1>Good to see you, {name}.</h1><p>Manage your profile, passwords, connected sign-in methods, and active sessions from one secure place.</p></div>
        <div className="account-status-card"><span className="account-status-dot" aria-hidden="true" /><div><strong>Signed in and ready</strong><p>{email}</p></div></div>
      </section>
      <section className="account-summary-grid" aria-label="Account overview">
        <article><span className="account-card-icon" aria-hidden="true">01</span><div><strong>Extension access</strong><p>The SneakSolve popup follows your current production Clerk session.</p></div></article>
        <article><span className="account-card-icon" aria-hidden="true">02</span><div><strong>Security controls</strong><p>Review passwords, connected accounts, and active devices below.</p></div></article>
        <article><span className="account-card-icon" aria-hidden="true">03</span><div><strong>Quick sign out</strong><p>Open your profile menu in the top-right corner whenever you need it.</p></div></article>
      </section>
      <section className="account-settings-section" aria-labelledby="account-settings-title">
        <div className="account-settings-heading"><div><span className="section-kicker">PROFILE &amp; SECURITY</span><h2 id="account-settings-title">Your account details</h2></div><p>Changes are handled securely through Clerk and apply to your SneakSolve session.</p></div>
        <div className="profile-shell" aria-label="SneakSolve account settings"><UserProfile routing="hash" /></div>
      </section>
    </main>
  );
}
