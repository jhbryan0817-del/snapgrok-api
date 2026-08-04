"use client";

import { useAuth } from "@clerk/react";
import { useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  BillingApiError,
  cancelBillingMembership,
  reactivateBillingMembership,
} from "../billing-api";

type PaidPlan = "plus" | "ultra";
type BillingAction = `${PaidPlan}:cancel` | `${PaidPlan}:reactivate`;

export function BillingPanel() {
  const { getToken } = useAuth();
  const { status, loading, error, refresh } = useBillingStatus();
  const [billingMessage, setBillingMessage] = useState("");
  const [workingAction, setWorkingAction] = useState<BillingAction | null>(null);

  async function cancelRenewal(plan: PaidPlan) {
    if (
      !window.confirm(
        `Cancel ${planName(plan)} renewal at the end of its current billing period? Its remaining questions stay available until then.`,
      )
    ) {
      return;
    }
    setWorkingAction(`${plan}:cancel`);
    setBillingMessage("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      const cancellation = await cancelBillingMembership(token, plan);
      setBillingMessage(
        cancellation.endsAt
          ? `${planName(plan)} renewal canceled. Access continues until ${formatReset(cancellation.endsAt)}.`
          : `${planName(plan)} renewal canceled. Access ends with its current period.`,
      );
      await refresh();
    } catch (caught) {
      setBillingMessage(actionError(caught, "Renewal could not be canceled."));
    } finally {
      setWorkingAction(null);
    }
  }

  async function reactivateRenewal(plan: PaidPlan) {
    setWorkingAction(`${plan}:reactivate`);
    setBillingMessage("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      const reactivation = await reactivateBillingMembership(token, plan);
      setBillingMessage(
        reactivation.renewsAt
          ? `${planName(plan)} renewal reactivated. The next renewal is ${formatReset(reactivation.renewsAt)}.`
          : `${planName(plan)} renewal reactivated.`,
      );
      await refresh();
    } catch (caught) {
      setBillingMessage(actionError(caught, "Renewal could not be reactivated."));
    } finally {
      setWorkingAction(null);
    }
  }

  const subscriptions = status?.subscriptions || [];
  const manageableSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.status === "active" ||
      (subscription.status === "cancel_at_period_end" &&
        subscription.cancelAtPeriodEnd),
  );
  const showPlanInAction = manageableSubscriptions.length > 1;

  return (
    <section className="billing-panel" aria-labelledby="billing-panel-title">
      <div className="billing-panel-heading">
        <div>
          <span className="section-kicker">PLAN &amp; USAGE</span>
          <h2 id="billing-panel-title">Zenaian plan</h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <p className="billing-panel-state">Loading secure plan information...</p>
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
          Billing is not enabled for this account environment. Its current
          extension access remains unchanged.
        </p>
      ) : null}

      <div className="billing-panel-actions">
        <a href="/pricing">View plans</a>
        {manageableSubscriptions.map((subscription) => {
          const plan = subscription.planId;
          const canceling = workingAction === `${plan}:cancel`;
          const reactivating = workingAction === `${plan}:reactivate`;
          const planLabel = showPlanInAction ? ` ${planName(plan)}` : "";

          if (
            subscription.status === "cancel_at_period_end" &&
            subscription.cancelAtPeriodEnd
          ) {
            return (
              <button
                type="button"
                key={plan}
                disabled={workingAction !== null}
                onClick={() => void reactivateRenewal(plan)}
              >
                {reactivating
                  ? `Reactivating${planLabel}...`
                  : `Reactivate${planLabel} renewal`}
              </button>
            );
          }

          return (
            <button
              type="button"
              key={plan}
              disabled={workingAction !== null}
              onClick={() => void cancelRenewal(plan)}
            >
              {canceling
                ? `Canceling${planLabel}...`
                : `Cancel${planLabel} renewal`}
            </button>
          );
        })}
      </div>
      {billingMessage || error ? (
        <p className="billing-panel-message" role="status">
          {billingMessage || error}
        </p>
      ) : null}
    </section>
  );
}

function planName(plan: PaidPlan): string {
  return plan === "ultra" ? "Ultra" : "Plus";
}

function actionError(caught: unknown, fallback: string): string {
  return caught instanceof BillingApiError
    ? caught.message
    : `${fallback} Please try again.`;
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
