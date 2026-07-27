const API_ORIGIN = "https://api.lemonsqueezy.com";

export function createLemonSqueezyClient({
  apiKey,
  storeId,
  storeUrl,
  testMode,
  timeoutMs = 10000,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("LEMONSQUEEZY_API_KEY is required.");
  if (!/^[1-9]\d*$/.test(storeId)) {
    throw new Error("LEMONSQUEEZY_STORE_ID must be a positive integer.");
  }
  const storeOrigin = exactHttpsOrigin(storeUrl, "LEMONSQUEEZY_STORE_URL");

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Billing request timed out.", "TimeoutError")),
      timeoutMs,
    );

    try {
      const response = await fetchImpl(`${API_ORIGIN}${path}`, {
        ...options,
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${apiKey}`,
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.data) {
        const error = new Error("Lemon Squeezy request failed.");
        error.status = 502;
        error.code = response.status === 429
          ? "BILLING_PROVIDER_RATE_LIMITED"
          : "BILLING_PROVIDER_UNAVAILABLE";
        error.providerStatus = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.code) throw error;
      const unavailable = new Error("Lemon Squeezy is temporarily unavailable.");
      unavailable.status = 502;
      unavailable.code = "BILLING_PROVIDER_UNAVAILABLE";
      throw unavailable;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async createCheckout({
      variantId,
      email,
      name,
      custom,
      redirectUrl,
    }) {
      requirePositiveId(variantId, "variantId");
      const payload = await request("/v1/checkouts", {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "checkouts",
            attributes: {
              test_mode: Boolean(testMode),
              product_options: {
                enabled_variants: [Number(variantId)],
                redirect_url: redirectUrl,
                receipt_button_text: "Return to SneakSolve",
                receipt_thank_you_note:
                  "Your SneakSolve plan will activate after secure payment confirmation.",
              },
              checkout_options: {
                embed: false,
                media: false,
                logo: true,
              },
              checkout_data: {
                email: normalizedEmail(email) || undefined,
                name: normalizedName(name) || undefined,
                custom,
              },
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            },
            relationships: {
              store: {
                data: { type: "stores", id: storeId },
              },
              variant: {
                data: { type: "variants", id: String(variantId) },
              },
            },
          },
        }),
      });

      const checkout = payload.data;
      if (
        checkout.type !== "checkouts" ||
        String(checkout.attributes?.store_id) !== storeId ||
        String(checkout.attributes?.variant_id) !== String(variantId) ||
        Boolean(checkout.attributes?.test_mode) !== Boolean(testMode)
      ) {
        throw billingResponseInvalid();
      }

      const checkoutUrl = safeProviderUrl(
        checkout.attributes?.url,
        storeOrigin,
      );
      return {
        id: String(checkout.id),
        url: checkoutUrl,
      };
    },

    async retrieveSubscription(subscriptionId) {
      requirePositiveId(subscriptionId, "subscriptionId");
      const payload = await request(
        `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      if (
        payload.data.type !== "subscriptions" ||
        String(payload.data.id) !== String(subscriptionId) ||
        String(payload.data.attributes?.store_id) !== storeId ||
        Boolean(payload.data.attributes?.test_mode) !== Boolean(testMode)
      ) {
        throw billingResponseInvalid();
      }
      return payload.data;
    },

    async customerPortalUrl(subscriptionId) {
      const subscription = await this.retrieveSubscription(subscriptionId);
      return safeProviderUrl(
        subscription.attributes?.urls?.customer_portal,
        storeOrigin,
      );
    },
  };
}

function safeProviderUrl(value, storeOrigin) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw billingResponseInvalid();
  }
  const storeHostname = new URL(storeOrigin).hostname;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === storeHostname ||
      url.hostname === "lemonsqueezy.com" ||
      url.hostname.endsWith(".lemonsqueezy.com")
    )
  ) {
    throw billingResponseInvalid();
  }
  return url.href;
}

function exactHttpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== String(value).replace(/\/$/, "") ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an HTTPS origin.`);
  }
  return url.origin;
}

function requirePositiveId(value, name) {
  if (!/^[1-9]\d*$/.test(String(value || ""))) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function normalizedEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email) ? email : "";
}

function normalizedName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 100 ? name : "";
}

function billingResponseInvalid() {
  const error = new Error("Lemon Squeezy returned an invalid response.");
  error.status = 502;
  error.code = "BILLING_PROVIDER_RESPONSE_INVALID";
  return error;
}
