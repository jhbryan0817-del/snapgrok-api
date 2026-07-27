import assert from "node:assert/strict";
import test from "node:test";
import { createLemonSqueezyClient } from "../src/lemon-squeezy.js";

test("checkout creation keeps provider credentials server-side and pins the variant", async () => {
  let request;
  const client = createLemonSqueezyClient({
    apiKey: "test-api-key-that-is-long-enough",
    storeId: "439517",
    storeUrl: "https://sneaksolve.lemonsqueezy.com",
    testMode: true,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({
        data: {
          type: "checkouts",
          id: "checkout-1",
          attributes: {
            store_id: 439517,
            variant_id: 1950672,
            test_mode: true,
            url: "https://sneaksolve.lemonsqueezy.com/checkout/buy/test",
          },
        },
      });
    },
  });

  const result = await client.createCheckout({
    variantId: "1950672",
    email: "tester@example.com",
    name: "Test User",
    custom: {
      clerk_user_id: "user_test",
      checkout_intent_id: "intent",
    },
    redirectUrl: "https://www.sneaksolve.com/account?billing=return",
  });
  assert.equal(result.id, "checkout-1");
  assert.equal(
    request.options.headers.Authorization,
    "Bearer test-api-key-that-is-long-enough",
  );
  const body = JSON.parse(request.options.body);
  assert.equal(body.data.attributes.test_mode, true);
  assert.deepEqual(
    body.data.attributes.product_options.enabled_variants,
    [1950672],
  );
  assert.equal(
    body.data.relationships.variant.data.id,
    "1950672",
  );
  assert.equal(
    body.data.attributes.checkout_data.custom.checkout_intent_id,
    "intent",
  );
});

test("a live-mode checkout response is rejected by a test-mode client", async () => {
  const client = createLemonSqueezyClient({
    apiKey: "test-api-key-that-is-long-enough",
    storeId: "439517",
    storeUrl: "https://sneaksolve.lemonsqueezy.com",
    testMode: true,
    fetchImpl: async () =>
      jsonResponse({
        data: {
          type: "checkouts",
          id: "checkout-1",
          attributes: {
            store_id: 439517,
            variant_id: 1950672,
            test_mode: false,
            url: "https://sneaksolve.lemonsqueezy.com/checkout/buy/test",
          },
        },
      }),
  });
  await assert.rejects(
    client.createCheckout({
      variantId: "1950672",
      custom: {},
      redirectUrl: "https://www.sneaksolve.com/account",
    }),
    (error) => error.code === "BILLING_PROVIDER_RESPONSE_INVALID",
  );
});

test("customer portal URLs are read from a freshly retrieved subscription", async () => {
  const client = createLemonSqueezyClient({
    apiKey: "test-api-key-that-is-long-enough",
    storeId: "439517",
    storeUrl: "https://sneaksolve.lemonsqueezy.com",
    testMode: true,
    fetchImpl: async () =>
      jsonResponse({
        data: {
          type: "subscriptions",
          id: "7001",
          attributes: {
            store_id: 439517,
            test_mode: true,
            urls: {
              customer_portal:
                "https://sneaksolve.lemonsqueezy.com/billing?signature=abc",
            },
          },
        },
      }),
  });
  assert.equal(
    await client.customerPortalUrl("7001"),
    "https://sneaksolve.lemonsqueezy.com/billing?signature=abc",
  );
});

test("unexpected redirect hosts are never returned to a client", async () => {
  const client = createLemonSqueezyClient({
    apiKey: "test-api-key-that-is-long-enough",
    storeId: "439517",
    storeUrl: "https://sneaksolve.lemonsqueezy.com",
    testMode: true,
    fetchImpl: async () =>
      jsonResponse({
        data: {
          type: "subscriptions",
          id: "7001",
          attributes: {
            store_id: 439517,
            test_mode: true,
            urls: {
              customer_portal: "https://attacker.example/phish",
            },
          },
        },
      }),
  });
  await assert.rejects(
    client.customerPortalUrl("7001"),
    (error) => error.code === "BILLING_PROVIDER_RESPONSE_INVALID",
  );
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}
