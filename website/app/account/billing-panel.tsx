"use client";

import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import {
  BillingApiError,
  BillingStatus,
  createCustomerPortal,
  getBillingStatus,
  trustedBillingRedirect,
} from "../billing-api";

export function BillingPanel() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      setStatus(await getBillingStatus(token));
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof BillingApiError
          ? error.message
          : "Plan status could not be loaded. Please refresh this page.",
      );
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
    const billingReturn =
      new URLSearchParams(window.location.search).get("billing") === "return";
    if (!billingReturn) return;

    const retries = [1500, 3500, 7000].map((delay) =>
      window.setTimeout(() => void refresh(), delay),
    );
    return () => retries.forEach((timer) => window.clearTimeout(timer));
  }, [refresh]);

  async function openPortal() {
    setOpeningPortal(true);
    setMessage("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      const portal = await createCustomerPortal(token);
      window.location.assign(trustedBillingRedirect(portal.url));
    } catch (error) {
      setMessage(
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
        <button type="button" onClick={refresh} disabled={loading}>
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
      {message ? <p className="billing-panel-message" role="status">{message}</p> : null}
    </section>
  );
}

function formatReset(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(date);
}
