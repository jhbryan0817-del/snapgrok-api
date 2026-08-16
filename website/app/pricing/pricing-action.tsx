"use client";

import { useAuth, useClerk, useUser } from "@clerk/react";
import { useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  BillingApiError,
  cancelBillingMembership,
  createBillingCheckout,
  trustedBillingRedirect,
} from "../billing-api";
import { isPaidPlanChange, planActionLabel } from "./plan-labels";
import { clearExtensionAccessBeforeSignOut } from "../sign-out";

type PlanId = "free" | "plus" | "ultra";
type PaidPlan = Exclude<PlanId, "free">;
type Notice = {
  title: string;
  body: string;
  action?: "open-account" | "create-account";
};

export function PricingAction({
  plan,
  label,
}: {
  plan: PlanId;
  label: string;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const {
    status,
    loading: loadingStatus,
    error: statusError,
    refresh,
  } = useBillingStatus();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeError, setNoticeError] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const currentPlan =
    status?.billingEnabled && status.plan ? status.plan.id : null;
  const current = Boolean(isSignedIn && currentPlan === plan);
  const entitledSubscriptions = (status?.subscriptions || []).filter(
    (subscription) =>
      ["active", "cancel_at_period_end"].includes(subscription.status),
  );
  const overlappingLegacySubscriptions = entitledSubscriptions.length > 1;
  const planChange =
    Boolean(isSignedIn) && isPaidPlanChange(currentPlan, plan);
  const displayLabel = planActionLabel(plan, currentPlan, label);
  const statusUnavailable = Boolean(
    isLoaded && isSignedIn && !loadingStatus && statusError && !status,
  );
  const className = [
    "pricing-cta",
    current ? "pricing-cta-current" : "",
  ].filter(Boolean).join(" ");

  if (isLoaded && !isSignedIn) {
    return (
      <a className={className} href="/account?mode=sign-up">
        {plan === "free" ? label : `Sign in to ${label}`}
      </a>
    );
  }

  async function handlePlanChange() {
    if (currentPlan !== "plus" && currentPlan !== "ultra") return;

    if (overlappingLegacySubscriptions) {
      setNotice({
        title: "Manage existing renewals",
        body: "This account contains more than one paid subscription from the earlier checkout policy. Open your account and cancel each renewal you no longer want; Zenaian will not make an ambiguous billing change automatically.",
        action: "open-account",
      });
      return;
    }

    const subscription = status?.subscription;
    if (!subscription || subscription.planId !== currentPlan) {
      setMessage("Your paid subscription status could not be confirmed. Refresh and try again.");
      return;
    }

    let endsAt = subscription.endsAt || status?.usage?.resetsAt || null;
    const alreadyCanceled = Boolean(subscription.cancelAtPeriodEnd);
    if (!alreadyCanceled) {
      const confirmed = window.confirm(
        `Switching plans is not immediate. This will cancel ${planName(currentPlan)} renewal, while your current access remains available until ${formatBillingDate(endsAt)}. Continue?`,
      );
      if (!confirmed) return;

      setWorking(true);
      setMessage("");
      try {
        const token = await getToken({ skipCache: true });
        if (!token) {
          window.location.assign("/account?mode=sign-in");
          return;
        }
        const cancellation = await cancelBillingMembership(token, currentPlan);
        endsAt = cancellation.endsAt || endsAt;
        await refresh();
      } catch (error) {
        setMessage(actionMessage(error));
        return;
      } finally {
        setWorking(false);
      }
    }

    setNoticeError("");
    setNotice({
      title: alreadyCanceled ? "Renewal is already canceled" : "Renewal canceled",
      body: transitionNotice(currentPlan, plan, endsAt),
      action:
        currentPlan === "plus" && plan === "ultra"
          ? "create-account"
          : undefined,
    });
  }

  async function createSeparateAccount() {
    setCreatingAccount(true);
    setNoticeError("");
    try {
      await clearExtensionAccessBeforeSignOut(() => getToken());
      await signOut({ redirectUrl: "/account?mode=sign-in" });
    } catch {
      setNoticeError("The current account could not be signed out. Please try again.");
      setCreatingAccount(false);
    }
  }

  async function startCheckout() {
    setWorking(true);
    setMessage("");
    try {
      const token = await getToken({ skipCache: true });
      if (!token) {
        window.location.assign("/account?mode=sign-in");
        return;
      }
      const checkout = await createBillingCheckout(token, {
        plan: plan as PaidPlan,
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName || undefined,
      });
      window.location.assign(trustedBillingRedirect(checkout.url));
    } catch (error) {
      setMessage(checkoutMessage(error));
    } finally {
      setWorking(false);
    }
  }

  const buttonLabel = !isLoaded
    ? "Loading account..."
    : loadingStatus
      ? "Checking plan..."
      : statusUnavailable
        ? "Plan unavailable"
        : working
          ? "Updating renewal..."
          : displayLabel;

  return (
    <div className="pricing-action">
      <button
        className={className}
        type="button"
        disabled={
          !isLoaded ||
          loadingStatus ||
          statusUnavailable ||
          working ||
          current
        }
        onClick={
          planChange
            ? () => void handlePlanChange()
            : plan === "free"
              ? () => window.location.assign("/account")
              : () => void startCheckout()
        }
      >
        {buttonLabel}
      </button>
      {message || statusUnavailable ? (
        <p className="billing-action-message" role="status">
          {message || "Plan status could not be loaded. Refresh this page to try again."}
        </p>
      ) : null}

      {notice ? (
        <div className="billing-notice-backdrop" role="presentation">
          <section
            className="billing-notice-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`billing-notice-${plan}`}
          >
            <span className="section-kicker">PLAN CHANGE</span>
            <h2 id={`billing-notice-${plan}`}>{notice.title}</h2>
            <p>{notice.body}</p>
            {noticeError ? (
              <p className="billing-notice-error" role="status">{noticeError}</p>
            ) : null}
            <div className="billing-notice-actions">
              {notice.action === "open-account" ? (
                <a href="/account">Open account</a>
              ) : null}
              {notice.action === "create-account" ? (
                <button
                  className="billing-notice-secondary"
                  type="button"
                  disabled={creatingAccount}
                  onClick={() => void createSeparateAccount()}
                >
                  {creatingAccount ? "Signing out..." : "Create account"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={creatingAccount}
                onClick={() => setNotice(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function transitionNotice(
  currentPlan: PaidPlan,
  targetPlan: PlanId,
  endsAt: string | null,
): string {
  const expiry = formatBillingDate(endsAt);
  const currentName = planName(currentPlan);
  if (targetPlan === "free") {
    return `${currentName} remains active until ${expiry}. After that, this account will automatically return to the Free plan.`;
  }
  return `${currentName} remains active until ${expiry}. You can subscribe to ${planName(targetPlan)} after that date, or create a separate account to subscribe immediately.`;
}

function planName(plan: PaidPlan): string {
  return plan === "ultra" ? "Ultra" : "Plus";
}

function formatBillingDate(value: string | null): string {
  if (!value) return "the end of the current paid period";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "the end of the current paid period";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function actionMessage(error: unknown): string {
  if (error instanceof BillingApiError) return error.message;
  return "The renewal change could not be completed. Please try again.";
}

function checkoutMessage(error: unknown): string {
  if (error instanceof BillingApiError) {
    if (error.code === "NOT_FOUND") {
      return "Billing checkout is not available for this account right now.";
    }
    if (error.code === "SUBSCRIPTION_ALREADY_ACTIVE") {
      return "This account already has paid access. Cancel renewal and wait for that period to expire before purchasing another plan.";
    }
    if (error.code === "CHECKOUT_ALREADY_PENDING") {
      return "A checkout is already being created. Please try again in a moment.";
    }
    if (error.code === "CHECKOUT_PLAN_CHANGE_PENDING") {
      return "An earlier checkout is still active. Finish it or wait briefly before choosing a different plan.";
    }
    return error.message;
  }
  return "Checkout could not be opened. Please try again.";
}
