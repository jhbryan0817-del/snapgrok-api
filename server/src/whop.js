import { createHmac, timingSafeEqual } from "node:crypto";

const API_ORIGINS = Object.freeze({
  test: "https://sandbox-api.whop.com",
  live: "https://api.whop.com",
});

const CHECKOUT_HOSTS = Object.freeze({
  test: new Set(["sandbox.whop.com"]),
  live: new Set(["whop.com", "www.whop.com"]),
});

export function createWhopClient({
  apiKey,
  companyId,
  mode,
  timeoutMs = 10000,
  fetchImpl = fetch,
}) {
  const apiOrigin = API_ORIGINS[mode];
  const checkoutHosts = CHECKOUT_HOSTS[mode];
  if (!apiOrigin || !checkoutHosts) {
    throw new Error("Whop client mode must be test or live.");
  }

  async function request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();
    let response;
    try {
      response = await fetchImpl(`${apiOrigin}/api/v1${path}`, {
        method,
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw providerError(504, "Whop did not respond in time.", "WHOP_TIMEOUT");
      }
      throw providerError(
        502,
        "Whop could not be reached.",
        "WHOP_UNAVAILABLE",
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const status = response.status === 429 ? 503 : 502;
      throw providerError(
        status,
        response.status === 429
          ? "Whop is temporarily rate limited. Please try again shortly."
          : "Whop rejected the billing request.",
        response.status === 429 ? "WHOP_RATE_LIMITED" : "WHOP_REQUEST_FAILED",
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw providerError(502, "Whop returned an invalid response.", "WHOP_RESPONSE_INVALID");
    }
    return payload;
  }

  return {
    async createCheckout({ planId, metadata, redirectUrl }) {
      const checkout = await request("/checkout_configurations", {
        method: "POST",
        body: {
          plan_id: planId,
          metadata,
          mode: "payment",
          redirect_url: redirectUrl,
        },
      });
      if (
        !safeProviderId(checkout.id, "ch") ||
        checkout.company_id !== companyId ||
        checkout.plan?.id !== planId
      ) {
        throw providerError(
          502,
          "Whop returned a checkout for the wrong catalog item.",
          "WHOP_CATALOG_MISMATCH",
        );
      }
      return {
        id: checkout.id,
        url: trustedWhopUrl(checkout.purchase_url, checkoutHosts),
      };
    },

    async retrieveMembership(membershipId) {
      requireProviderId(membershipId, "mem", "membershipId");
      return request(`/memberships/${encodeURIComponent(membershipId)}`);
    },

    async cancelMembershipAtPeriodEnd(membershipId) {
      requireProviderId(membershipId, "mem", "membershipId");
      return request(`/memberships/${encodeURIComponent(membershipId)}/cancel`, {
        method: "POST",
        body: { cancellation_mode: "at_period_end" },
      });
    },
  };
}

export function verifyWhopWebhook({
  rawBody,
  webhookId,
  webhookTimestamp,
  webhookSignature,
  secret,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const id = String(webhookId || "").trim();
  const timestampText = String(webhookTimestamp || "").trim();
  if (!/^msg_[A-Za-z0-9_-]{8,120}$/.test(id) || !/^\d{10}$/.test(timestampText)) {
    throw webhookSignatureError();
  }
  const timestamp = Number(timestampText);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > toleranceSeconds
  ) {
    throw providerError(
      401,
      "Webhook timestamp is outside the accepted window.",
      "WEBHOOK_TIMESTAMP_INVALID",
    );
  }

  const candidates = String(webhookSignature || "")
    .trim()
    .split(/\s+/)
    .map((value) => value.split(",", 2))
    .filter(([version, signature]) => version === "v1" && isBase64Signature(signature))
    .map(([, signature]) => Buffer.from(signature, "base64"));
  if (candidates.length === 0) throw webhookSignatureError();

  const signedContent = Buffer.concat([
    Buffer.from(`${id}.${timestampText}.`, "utf8"),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody),
  ]);
  const expected = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(signedContent)
    .digest();
  const valid = candidates.some(
    (provided) =>
      provided.length === expected.length && timingSafeEqual(provided, expected),
  );
  if (!valid) throw webhookSignatureError();
  return { id, timestamp: new Date(timestamp * 1000) };
}

export function trustedWhopUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw providerError(502, "Whop returned an invalid URL.", "WHOP_REDIRECT_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !allowedHosts.has(url.hostname)
  ) {
    throw providerError(502, "Whop returned an invalid URL.", "WHOP_REDIRECT_INVALID");
  }
  return url.href;
}

function safeProviderId(value, prefix) {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{6,120}$`).test(String(value || ""));
}

function requireProviderId(value, prefix, name) {
  if (!safeProviderId(value, prefix)) {
    throw providerError(400, `${name} is invalid.`, "WHOP_ID_INVALID");
  }
}

function isBase64Signature(value) {
  return typeof value === "string" && /^[A-Za-z0-9+/]{43}=$/.test(value);
}

function webhookSignatureError() {
  return providerError(
    401,
    "Webhook signature is invalid.",
    "WEBHOOK_SIGNATURE_INVALID",
  );
}

function providerError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}
