"use client";

import { useAuth, useUser } from "@clerk/react";
import { useState } from "react";
import { useBillingStatus } from "../billing-status-context";
import {
  BillingApiError,
  createBillingCheckout,
  trustedBillingRedirect,
} from "../billing-api";
import { isPaidPlanChange, planActionLabel } from "./plan-labels";

type PlanId = "free" | "plus" | "ultra";

export function PricingAction({
  plan,
  label,
}: {
  plan: PlanId;
  label: string;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const {
    status,
    loading: loadingStatus,
    error: statusError,
  } = useBillingStatus();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const currentPlan =
    status?.billingEnabled && status.plan ? status.plan.id : null;
  const targetSubscription = status?.subscriptions?.find(
    (subscription) => subscription.planId === plan,
  );
  const targetEntitled = Boolean(
    targetSubscription &&
    ["active", "cancel_at_period_end"].includes(targetSubscription.status),
  );
  const current = Boolean(isSignedIn && currentPlan === plan);
  const activeTarget = Boolean(
    targetSubscription?.status === "active" &&
    !targetSubscription.cancelAtPeriodEnd,
  );
  const reactivatableTarget = Boolean(
    targetSubscription?.status === "cancel_at_period_end" &&
    targetSubscription.cancelAtPeriodEnd,
  );
  const planChange =
    Boolean(isSignedIn) && !targetEntitled && isPaidPlanChange(currentPlan, plan);
  const displayLabel = planActionLabel(
    plan,
    currentPlan,
    label,
    targetSubscription || null,
  );
  const statusUnavailable = Boolean(
    isLoaded && isSignedIn && !loadingStatus && statusError && !status,
  );
  const className = [
    "pricing-cta",
    current || activeTarget ? "pricing-cta-current" : "",
  ].filter(Boolean).join(" ");

  if (isLoaded && !isSignedIn) {
    return (
      <a className={className} href="/account?mode=sign-up">
        {plan === "free" ? label : `Sign in to ${label}`}
      </a>
    );
  }

  function showPlanChangeNotice() {
    setMessage(
      plan === "free"
        ? "Cancel paid renewals from your account. Free begins automatically after all paid access ends."
        : "Plus cannot be purchased while Ultra is active. Cancel Ultra and wait for its paid period to end first.",
    );
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
        plan: plan as "plus" | "ultra",
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
    ? "Loading account…"
    : loadingStatus
      ? "Checking plan…"
      : statusUnavailable
        ? "Plan unavailable"
      : working
        ? "Opening secure checkout…"
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
          activeTarget ||
          (current && plan === "free")
        }
        onClick={
          reactivatableTarget
            ? () => window.location.assign("/account")
            : planChange
            ? showPlanChangeNotice
            : plan === "free"
              ? () => window.location.assign("/account")
              : startCheckout
        }
      >
        {buttonLabel}
      </button>
      {message || statusUnavailable ? (
        <p className="billing-action-message" role="status">
          {message || "Plan status could not be loaded. Refresh this page to try again."}
        </p>
      ) : null}
    </div>
  );
}

function checkoutMessage(error: unknown): string {
  if (error instanceof BillingApiError) {
    if (error.code === "NOT_FOUND") {
      return "Billing checkout is not available for this account right now.";
    }
    if (error.code === "SUBSCRIPTION_ALREADY_ACTIVE") {
      return "This account already has a paid subscription. Manage it from your account page.";
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
