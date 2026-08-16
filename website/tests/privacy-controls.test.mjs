import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("account privacy controls use authenticated export and deletion routes", () => {
  const account = read("app/account/page.tsx");
  const panel = read("app/account/privacy-panel.tsx");
  const api = read("app/privacy-api.ts");

  assert.match(account, /<PrivacyPanel \/>/);
  for (const label of ["Download JSON", "Delete account"]) {
    assert.match(panel, new RegExp(label));
  }
  for (const path of [
    "/api/privacy/export",
    "/api/privacy/delete-account",
  ]) {
    assert.match(api, new RegExp(path));
  }
  assert.match(api, /Authorization: `Bearer \$\{token\}`/);
  assert.match(api, /credentials: "omit"/);
  assert.match(api, /response\.headers\.get\("x-request-id"\)/);
  assert.match(api, /requestId: string \| null/);
  assert.match(panel, /getToken\(\{ skipCache: true \}\)/);
  assert.match(panel, /useReverification/);
  assert.match(panel, /reason: "reverification-error"/);
  assert.match(panel, /level: "first_factor"/);
  assert.match(panel, /AUTH_REVERIFICATION_REQUIRED/);
  assert.match(panel, /error\.reverificationAfterMinutes \|\| 10/);
  assert.match(panel, /Error code: \$\{error\.code\}/);
  assert.match(panel, /Reference: \$\{error\.requestId\}/);
  assert.doesNotMatch(panel, /sign out and sign in again/i);
  assert.doesNotMatch(panel, /View my data|Hide my data|PrivacySummaryView/);
  assert.doesNotMatch(panel, /Why are you deleting|deletion reason|reason for deleting/i);
});

test("deletion clears the Clerk session and preserves a local receipt", () => {
  const panel = read("app/account/privacy-panel.tsx");
  const receipt = read("app/account-deleted/page.tsx");
  assert.match(panel, /zenaianDeletionReceipt/);
  assert.match(panel, /signOut\(\{ redirectUrl: "\/account-deleted" \}\)/);
  assert.match(panel, /window\.location\.replace\("\/account-deleted"\)/);
  assert.match(receipt, /signOut\(\{ redirectUrl: "\/account-deleted" \}\)/);
});

test("account deletion requires four acknowledgements and exact typed DELETE", () => {
  const panel = read("app/account/privacy-panel.tsx");
  assert.equal((panel.match(/key: "/g) || []).length, 4);
  for (const field of [
    "confirmImmediateLoss",
    "confirmRenewalCancellation",
    "confirmLegalRetention",
    "confirmIrreversible",
  ]) {
    assert.match(panel, new RegExp(`${field}: true`));
  }
  assert.match(panel, /confirmText: "DELETE"/);
  assert.match(panel, /confirmText === "DELETE"/);
  assert.match(panel, /remaining Zenaian access and unused question allowance/);
  assert.match(panel, /request cancellation of future Whop renewal/);
  assert.match(panel, /retained separately when required by law/);
  assert.match(panel, /rolling provider backups age out/);
});

test("signup clearly represents 19+ acceptance without collecting date of birth", () => {
  const notice = read("app/sign-up-legal-notice.tsx");
  const signup = read("app/sign-up/page.tsx");
  const account = read("app/account/page.tsx");

  assert.match(notice, /confirm you are at least 19/);
  assert.match(notice, /href="\/terms"/);
  assert.match(notice, /href="\/privacy"/);
  assert.match(signup, /<SignUpLegalNotice \/>/);
  assert.match(account, /<SignUpLegalNotice \/>/);
  assert.doesNotMatch(`${notice}\n${signup}\n${account}`, /date of birth|birthdate|dob/i);
});

test("website adds no analytics SDK, behavioral telemetry, or consent banner", () => {
  const sources = [
    read("package.json"),
    read("app/layout.tsx"),
    read("app/page.tsx"),
    read("app/privacy/page.tsx"),
  ].join("\n");
  assert.doesNotMatch(sources, /google-analytics|gtag\(|segment|mixpanel|posthog|amplitude|cookiebot/i);
  assert.doesNotMatch(sources, /consent banner|cookie banner/i);
});
