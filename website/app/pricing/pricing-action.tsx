"use client";

import { useAuth, useUser } from "@clerk/react";
import { useState } from "react";
import {
  BillingApiError,
  createBillingCheckout,
  trustedBillingRedirect,
} from "../billing-api";

export function PricingAction({
  plan,
  label,
  featured,
}: {
  plan: "free" | "plus" | "ultra";
  label: string;
  featured: boolean;
}) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const className = featured
    ? "pricing-cta pricing-cta-primary"
    : "pricing-cta";

  if (plan === "free" || (isLoaded && !isSignedIn)) {
    return (
      <a className={className} href="/account?mode=sign-up">
        {plan === "free" ? label : `Sign in to ${label}`}
      </a>
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

  return (
    <div className="pricing-action">
      <button
        className={className}
        type="button"
        disabled={!isLoaded || working}
        onClick={startCheckout}
      >
        {!isLoaded
          ? "Loading account…"
          : working
            ? "Opening secure checkout…"
            : label}
      </button>
      {message ? (
        <p className="billing-action-message" role="status">
          {message}
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
