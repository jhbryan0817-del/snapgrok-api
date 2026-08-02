"use client";

import { useAuth } from "@clerk/react";
import { useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  BillingApiError,
  cancelBillingMembership,
} from "../billing-api";

export function BillingPanel() {
  const { getToken } = useAuth();
  const { status, loading, error, refresh } = useBillingStatus();
  const [billingMessage, setBillingMessage] = useState("");
  const [canceling, setCanceling] = useState(false);

  async function cancelRenewal() {
    if (
      !window.confirm(
        "Cancel renewal at the end of your current billing period? Your remaining questions stay available until then.",
      )
    ) {
      return;
    }
    setCanceling(true);
    setBillingMessage("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      const cancellation = await cancelBillingMembership(token);
      setBillingMessage(
        cancellation.endsAt
          ? `Renewal canceled. Access continues until ${formatReset(cancellation.endsAt)}.`
          : "Renewal canceled. Your account will return to Free at period end.",
      );
      await refresh();
    } catch (caught) {
      setBillingMessage(
        caught instanceof BillingApiError
          ? caught.message
          : "Renewal could not be canceled. Please try again.",
      );
    } finally {
      setCanceling(false);
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
            <span>
              {status.subscription?.cancelAtPeriodEnd
                ? "Expires on"
                : "Next reset"}
            </span>
            <strong>{formatReset(status.usage.resetsAt)}</strong>
            <small>
              {status.mode === "test"
                ? "Test-mode entitlement"
                : "Subscription entitlement"}
            </small>
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
        {status?.billingEnabled &&
        status.subscription &&
        !status.subscription.cancelAtPeriodEnd ? (
          <button type="button" disabled={canceling} onClick={cancelRenewal}>
            {canceling ? "Canceling…" : "Cancel renewal"}
          </button>
        ) : null}
      </div>
      {billingMessage || error ? (
        <p className="billing-panel-message" role="status">
          {billingMessage || error}
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
    return date.toISOString();
  }
}
