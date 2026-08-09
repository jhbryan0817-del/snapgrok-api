"use client";

import { useAuth } from "@clerk/react";
import { useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  BillingApiError,
  type BillingPayment,
  cancelBillingMembership,
  getBillingHistory,
  reactivateBillingMembership,
} from "../billing-api";

type PaidPlan = "plus" | "ultra";
type BillingAction = `${PaidPlan}:cancel` | `${PaidPlan}:reactivate`;

export function BillingPanel() {
  const { getToken } = useAuth();
  const { status, loading, error, refresh } = useBillingStatus();
  const [billingMessage, setBillingMessage] = useState("");
  const [workingAction, setWorkingAction] = useState<BillingAction | null>(null);
  const [payments, setPayments] = useState<BillingPayment[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  async function loadPaymentHistory() {
    if (payments || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("missing session token");
      const history = await getBillingHistory(token);
      setPayments(history.payments);
    } catch (caught) {
      setHistoryError(actionError(caught, "Payment history could not be loaded."));
    } finally {
      setHistoryLoading(false);
    }
  }

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
        <h2 id="billing-panel-title" className="section-kicker">PLAN &amp; USAGE</h2>
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
      {showPlanInAction ? (
        <p className="billing-panel-warning" role="status">
          This account has overlapping paid memberships created under the
          earlier checkout policy. Both renewals shown above are real Whop
          subscriptions. Cancel every renewal you do not want; Zenaian will
          not silently cancel or merge a paid membership.
        </p>
      ) : null}
      {billingMessage || error ? (
        <p className="billing-panel-message" role="status">
          {billingMessage || error}
        </p>
      ) : null}

      {status?.billingEnabled ? (
        <details
          className="payment-history"
          onToggle={(event) => {
            if (event.currentTarget.open) void loadPaymentHistory();
          }}
        >
          <summary>
            <span>Payment history</span>
            <small>Paid, disputed, and refunded payments</small>
          </summary>
          <div className="payment-history-body">
            {historyLoading ? (
              <p>Loading secure payment history...</p>
            ) : historyError ? (
              <div className="payment-history-error" role="status">
                <p>{historyError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPayments(null);
                    void loadPaymentHistory();
                  }}
                >
                  Try again
                </button>
              </div>
            ) : payments?.length ? (
              <ul>
                {payments.map((payment) => (
                  <li key={`${payment.reference}-${payment.updatedAt}`}>
                    <div>
                      <strong>{planName(payment.planId)}</strong>
                      <small>Reference ending {payment.reference}</small>
                    </div>
                    <div>
                      <span className={`payment-status payment-status-${payment.status}`}>
                        {paymentStatusLabel(payment.status)}
                      </span>
                      <time dateTime={payment.updatedAt || payment.paidAt || undefined}>
                        {formatReset(payment.updatedAt || payment.paidAt || "")}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No payment history has been recorded for this account yet.</p>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function planName(plan: PaidPlan): string {
  return plan === "ultra" ? "Ultra" : "Plus";
}

function paymentStatusLabel(status: BillingPayment["status"]): string {
  if (status === "refunded") return "Refunded";
  if (status === "disputed") return "Disputed";
  return "Paid";
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
    return new Intl.DateTimeFormat("en-US", {
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
