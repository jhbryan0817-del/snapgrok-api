import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createWhopClient,
  trustedWhopUrl,
  verifyWhopWebhook,
} from "../src/whop.js";

const COMPANY = "biz_745hMbzbWHtrZr";
const PLAN = "plan_QzpD3pxTswPLX";

test("sandbox checkout keeps credentials server-side and pins the plan", async () => {
  let request;
  const client = createWhopClient({
    apiKey: "sandbox_api_key_secret_value",
    companyId: COMPANY,
    mode: "test",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({
        id: "ch_checkout123456",
        company_id: COMPANY,
        plan: { id: PLAN },
        purchase_url: "https://sandbox.whop.com/checkout/example?session=ch_checkout123456",
      });
    },
  });
  const result = await client.createCheckout({
    planId: PLAN,
    metadata: { clerk_user_id: "user_Tester1234567890" },
    redirectUrl: "https://www.sneaksolve.com/account?billing=return",
  });
  assert.equal(result.id, "ch_checkout123456");
  assert.equal(request.url, "https://sandbox-api.whop.com/api/v1/checkout_configurations");
  assert.equal(request.init.headers.Authorization, "Bearer sandbox_api_key_secret_value");
  const body = JSON.parse(request.init.body);
  assert.equal(body.plan_id, PLAN);
  assert.equal(body.mode, "payment");
  assert.equal(body.metadata.clerk_user_id, "user_Tester1234567890");
});

test("sandbox checkout rejects production and attacker redirect hosts", async () => {
  for (const purchaseUrl of [
    "https://whop.com/checkout/live",
    "https://sandbox.whop.com.attacker.example/checkout/phish",
  ]) {
    const client = createWhopClient({
      apiKey: "sandbox_api_key_secret_value",
      companyId: COMPANY,
      mode: "test",
      fetchImpl: async () => Response.json({
        id: "ch_checkout123456",
        company_id: COMPANY,
        plan: { id: PLAN },
        purchase_url: purchaseUrl,
      }),
    });
    await assert.rejects(
      client.createCheckout({ planId: PLAN, metadata: {}, redirectUrl: "https://www.sneaksolve.com/account" }),
      (error) => error.code === "WHOP_REDIRECT_INVALID",
    );
  }
});

test("membership cancellation is explicitly at period end", async () => {
  let request;
  const client = createWhopClient({
    apiKey: "sandbox_api_key_secret_value",
    companyId: COMPANY,
    mode: "test",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({ id: "mem_membership123456" });
    },
  });
  await client.cancelMembershipAtPeriodEnd("mem_membership123456");
  assert.match(request.url, /\/memberships\/mem_membership123456\/cancel$/);
  assert.deepEqual(JSON.parse(request.init.body), { cancellation_mode: "at_period_end" });
});

test("membership reactivation uses Whop's uncancel endpoint without a body", async () => {
  let request;
  const client = createWhopClient({
    apiKey: "sandbox_api_key_secret_value",
    companyId: COMPANY,
    mode: "test",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json({ id: "mem_membership123456" });
    },
  });
  await client.uncancelMembership("mem_membership123456");
  assert.match(request.url, /\/memberships\/mem_membership123456\/uncancel$/);
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.body, undefined);
});

test("payment retrieval is pinned to the selected Whop environment", async () => {
  let requestedUrl = "";
  const client = createWhopClient({
    apiKey: "production_api_key_secret_value",
    companyId: COMPANY,
    mode: "live",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return Response.json({ id: "pay_payment123456" });
    },
  });
  await client.retrievePayment("pay_payment123456");
  assert.equal(
    requestedUrl,
    "https://api.whop.com/api/v1/payments/pay_payment123456",
  );
});

test("payment reconciliation uses a bounded, company-scoped production list", async () => {
  const requests = [];
  const client = createWhopClient({
    apiKey: "production_api_key_secret_value",
    companyId: COMPANY,
    mode: "live",
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return Response.json({
        data: [{ id: "pay_payment123456" }],
        page_info: {
          has_next_page: requests.length === 1,
          end_cursor: requests.length === 1 ? "cursor_next123456" : null,
        },
      });
    },
  });
  const payments = await client.listPaymentsSince(
    new Date("2026-07-27T00:00:00.000Z"),
    { maxPages: 2 },
  );
  assert.equal(payments.length, 2);
  assert.equal(requests[0].origin, "https://api.whop.com");
  assert.equal(requests[0].searchParams.get("company_id"), COMPANY);
  assert.equal(
    requests[0].searchParams.get("updated_after"),
    "2026-07-27T00:00:00.000Z",
  );
  assert.equal(requests[1].searchParams.get("after"), "cursor_next123456");
});

test("Standard Webhooks validation rejects stale timestamps and altered bodies", () => {
  const secret = "whop_webhook_secret_value_0123456789";
  const id = "msg_webhook123456";
  const timestamp = "1785153600";
  const rawBody = Buffer.from('{"type":"membership.activated"}');
  const signature = `v1,${createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`), rawBody]))
    .digest("base64")}`;
  assert.doesNotThrow(() => verifyWhopWebhook({
    rawBody,
    webhookId: id,
    webhookTimestamp: timestamp,
    webhookSignature: signature,
    secret,
    nowSeconds: Number(timestamp),
  }));
  assert.throws(
    () => verifyWhopWebhook({
      rawBody: Buffer.from('{"type":"payment.succeeded"}'),
      webhookId: id,
      webhookTimestamp: timestamp,
      webhookSignature: signature,
      secret,
      nowSeconds: Number(timestamp),
    }),
    (error) => error.code === "WEBHOOK_SIGNATURE_INVALID",
  );
  assert.throws(
    () => verifyWhopWebhook({
      rawBody,
      webhookId: id,
      webhookTimestamp: timestamp,
      webhookSignature: signature,
      secret,
      nowSeconds: Number(timestamp) + 301,
    }),
    (error) => error.code === "WEBHOOK_TIMESTAMP_INVALID",
  );
});

test("trusted Whop URLs require an exact HTTPS hostname", () => {
  assert.equal(
    trustedWhopUrl("https://sandbox.whop.com/checkout/example", new Set(["sandbox.whop.com"])),
    "https://sandbox.whop.com/checkout/example",
  );
  assert.throws(
    () => trustedWhopUrl("https://sandbox.whop.com@attacker.example/phish", new Set(["sandbox.whop.com"])),
    (error) => error.code === "WHOP_REDIRECT_INVALID",
  );
});
