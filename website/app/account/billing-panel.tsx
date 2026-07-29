"use client";

import { useAuth } from "@clerk/react";
import { useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  BillingApiError,
  createCustomerPortal,
  trustedBillingRedirect,
} from "../billing-api";

export function BillingPanel() {
  const { getToken } = useAuth();
  const { status, loading, error, refresh } = useBillingStatus();
  const [portalMessage, setPortalMessage] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);

  async function openPortal() {
    setOpeningPortal(true);
    setPortalMessage("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      const portal = await createCustomerPortal(token);
      window.location.assign(trustedBillingRedirect(portal.url));
    } catch (error) {
      setPortalMessage(
        error instanceof BillingApiError
          ? error.message
          : "The billing portal could not be opened. Please try again.",
      );
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <section className="billing-panel" aria-labelledby="billing-panel-title">
      <div className="billing-panel-heading">
        <div>
          <span className="section-kicker">PLAN &amp; USAGE</span>
          <h2 id="billing-panel-title">SneakSolve plan</h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p className="billing-panel-state">Loading secure plan information…</p>
      ) : status?.billingEnabled && status.plan && status.usage ? (
        <div className="billing-plan-overview">
          <div>
            <span>Current plan</span>
            <strong>{status.plan.name}</strong>
            <small>{status.plan.model}</small>
          </div>
          <div>
            <span>Questions remaining</span>
            <strong>{status.usage.remaining}</strong>
            <small>
              {status.usage.consumed} of {status.usage.allowance} used
            </small>
          </div>
          <div>
            <span>Next reset</span>
            <strong>{formatReset(status.usage.resetsAt)}</strong>
            <small>{status.mode === "test" ? "Test-mode entitlement" : "Subscription entitlement"}</small>
          </div>
        </div>
      ) : status ? (
        <p className="billing-panel-state">
          This account is outside the designated billing test group. Its current
          extension access remains unchanged during the test rollout.
        </p>
      ) : null}

      <div className="billing-panel-actions">
        <a href="/pricing">View plan upgrades</a>
        {status?.billingEnabled && status.subscription ? (
          <button type="button" disabled={openingPortal} onClick={openPortal}>
            {openingPortal ? "Opening…" : "Manage billing"}
          </button>
        ) : null}
      </div>
      {portalMessage || error ? (
        <p className="billing-panel-message" role="status">
          {portalMessage || error}
        </p>
      ) : null}
    </section>
  );
}

function formatReset(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    // Formatting support must never be able to crash account management.
    return date.toISOString();
  }
}
