"use client";

import { SignIn, SignUp, UserProfile, useUser } from "@clerk/react";
import { useSyncExternalStore } from "react";
import { AuthShell } from "../auth-shell";
import { BrandLogo } from "../brand-logo";
import { BillingStatusProvider } from "../billing-status-context";
import { SignUpLegalNotice } from "../sign-up-legal-notice";
import { SiteHeader } from "../site-header";
import { BillingPanel } from "./billing-panel";
import { BillingPanelBoundary } from "./billing-panel-boundary";
import { PrivacyPanel } from "./privacy-panel";

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
  const { isLoaded, isSignedIn } = useUser();
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
          <div className="signup-flow">
            <SignUp
              routing="hash"
              signInUrl="/account?mode=sign-in"
              forceRedirectUrl="/account"
              fallbackRedirectUrl="/account"
            />
            <SignUpLegalNotice />
          </div>
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

  return (
    <BillingStatusProvider>
      <main className="account-page">
        <div className="account-aurora" aria-hidden="true" />
        <SiteHeader />
        <header className="pricing-page-heading account-page-heading shell">
          <span className="section-kicker">VIEW YOUR DETAILS</span>
          <h1 className="page-section-title">Account &amp; Settings</h1>
        </header>

        <BillingPanelBoundary>
          <BillingPanel />
        </BillingPanelBoundary>

        <PrivacyPanel />

        <details
          className="account-settings-section account-settings-disclosure"
          aria-labelledby="account-settings-title"
        >
          <summary className="account-settings-summary">
            <span className="account-settings-summary-heading">
              <span className="section-kicker">PROFILE &amp; SECURITY</span>
              <span
                id="account-settings-title"
                className="account-settings-summary-title"
                role="heading"
                aria-level={2}
              >
                Your account details
              </span>
            </span>
            <span className="account-settings-summary-description">
              Changes are handled securely through Clerk and apply to your Zenaian session.
            </span>
            <span className="account-settings-chevron" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <div className="account-settings-content">
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
          </div>
        </details>
      </main>
    </BillingStatusProvider>
  );
}
