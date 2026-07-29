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
  const current = Boolean(isSignedIn && currentPlan === plan);
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

  function showPlanChangeNotice() {
    setMessage(
      "Plan switching will be enabled when subscription-change handling is added. Your current subscription is unchanged.",
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
          current
        }
        onClick={
          planChange
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
      return "Test checkout is currently limited to designated billing tester accounts.";
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
