"use client";

import { SignIn, SignUp, UserProfile, useUser } from "@clerk/react";
import { useSyncExternalStore } from "react";
import { AuthShell } from "../auth-shell";
import { BrandLogo } from "../brand-logo";
import { BillingStatusProvider } from "../billing-status-context";
import { SiteHeader } from "../site-header";
import { AccountReadiness } from "./account-readiness";
import { BillingPanel } from "./billing-panel";
import { BillingPanelBoundary } from "./billing-panel-boundary";

type AccountMode = "sign-in" | "sign-up";

function requestedMode(): AccountMode {
  if (typeof window === "undefined") return "sign-in";
  return new URLSearchParams(window.location.search).get("mode") === "sign-up"
    ? "sign-up"
    : "sign-in";
}

function subscribeToModeChange(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const mode = useSyncExternalStore(
    subscribeToModeChange,
    requestedMode,
    () => "sign-in" as AccountMode,
  );

  if (!isLoaded) {
    return (
      <main className="account-page account-page-loading">
        <SiteHeader />
        <div className="account-loading-mark account-loading-centered">
          <BrandLogo compact />
          <span>Loading your Zenaian account…</span>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <AuthShell>
        {mode === "sign-up" ? (
          <SignUp
            routing="hash"
            signInUrl="/account?mode=sign-in"
            forceRedirectUrl="/account"
            fallbackRedirectUrl="/account"
          />
        ) : (
          <SignIn
            routing="hash"
            signUpUrl="/account?mode=sign-up"
            forceRedirectUrl="/account"
            fallbackRedirectUrl="/account"
          />
        )}
      </AuthShell>
    );
  }

  const name = user?.firstName || user?.fullName || "there";
  return (
    <BillingStatusProvider>
      <main className="account-page">
        <div className="account-aurora" aria-hidden="true" />
        <SiteHeader />
        <section className="account-welcome">
          <div>
            <span className="section-kicker">YOUR ZENAIAN ACCOUNT</span>
            <h1>Good to see you, {name}.</h1>
            <p>
              Manage your profile, passwords, connected sign-in methods, and active sessions from one secure place.
            </p>
          </div>
          <AccountReadiness />
        </section>

        <BillingPanelBoundary>
          <BillingPanel />
        </BillingPanelBoundary>

        <section className="account-settings-section" aria-labelledby="account-settings-title">
          <div className="account-settings-heading">
            <div>
              <span className="section-kicker">PROFILE &amp; SECURITY</span>
              <h2 id="account-settings-title">Your account details</h2>
            </div>
            <p>Changes are handled securely through Clerk and apply to your Zenaian session.</p>
          </div>
          <div className="profile-shell" aria-label="Zenaian account settings">
            <UserProfile
              routing="hash"
              appearance={{
                elements: {
                  rootBox: { width: "100%", maxWidth: "900px" },
                  cardBox: { width: "100%", maxWidth: "900px" },
                },
              }}
            />
          </div>
        </section>
      </main>
    </BillingStatusProvider>
  );
}
