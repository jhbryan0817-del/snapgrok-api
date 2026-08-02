"use client";

const API_ORIGIN = requiredApiOrigin(
  process.env.NEXT_PUBLIC_API_URL,
);

export type BillingPlan = {
  id: "free" | "plus" | "ultra";
  name: string;
  allowance: number;
  cadence: "day" | "billing_period";
  model: string;
};

export type BillingStatus = {
  billingEnabled: boolean;
  mode: "legacy" | "test" | "live";
  plan: BillingPlan | null;
  usage: {
    allowance: number;
    consumed: number;
    reserved: number;
    remaining: number;
    resetsAt: string;
  } | null;
  subscription: {
    provider: "whop";
    status: string;
    providerStatus: string;
    renewsAt: string | null;
    endsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export class BillingApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BillingApiError";
    this.status = status;
    this.code = code;
  }
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  return billingRequest<BillingStatus>("/api/billing/status", token);
}

export async function createBillingCheckout(
  token: string,
  input: {
    plan: "plus" | "ultra";
    email?: string;
    name?: string;
  },
): Promise<{ url: string }> {
  return billingRequest<{ url: string }>(
    "/api/billing/checkout",
    token,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function cancelBillingMembership(
  token: string,
): Promise<{ cancelAtPeriodEnd: true; endsAt: string | null }> {
  return billingRequest<{ cancelAtPeriodEnd: true; endsAt: string | null }>(
    "/api/billing/cancel",
    token,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export function trustedBillingRedirect(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BillingApiError(
      502,
      "BILLING_REDIRECT_INVALID",
      "The billing provider returned an invalid destination.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === "sandbox.whop.com" ||
      url.hostname === "whop.com" ||
      url.hostname === "www.whop.com"
    )
  ) {
    throw new BillingApiError(
      502,
      "BILLING_REDIRECT_INVALID",
      "The billing provider returned an invalid destination.",
    );
  }
  return url.href;
}

async function billingRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  if (!token) {
    throw new BillingApiError(
      401,
      "AUTH_REQUIRED",
      "Please sign in again before managing billing.",
    );
  }
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new BillingApiError(
      response.status,
      safeErrorCode(payload?.code),
      safeErrorMessage(payload?.error, response.status),
    );
  }
  return payload as T;
}

function requiredApiOrigin(value: string | undefined): string {
  if (!value) throw new Error("NEXT_PUBLIC_API_URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_API_URL must be an absolute URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("NEXT_PUBLIC_API_URL must be an HTTPS origin without a path.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.hostname !== "snapgrok-api.onrender.com"
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must use https://snapgrok-api.onrender.com in production.",
    );
  }
  return url.origin;
}

function safeErrorCode(value: unknown): string {
  const code = String(value || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
    ? code
    : "BILLING_REQUEST_FAILED";
}

function safeErrorMessage(value: unknown, status: number): string {
  const message = String(value || "");
  if (status < 500 && message.length > 0 && message.length <= 240) {
    return message;
  }
  return "The billing service is temporarily unavailable. Please try again.";
}
