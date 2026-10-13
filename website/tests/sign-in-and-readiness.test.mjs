import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { Children, isValidElement } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Render the actual components with isolated hooks and service responses. No Clerk
// credentials, account mutations, or extension installation are needed by these tests.
function componentHarness(path, dependencies, window = {}, env = {}) {
  const state = [];
  const callbacks = [];
  const effects = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      }];
    },
    useEffect(effect) { effects.push(effect); },
    useCallback(callback) { callbacks.push(callback); return callback; },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
  };
  const code = ts.transpileModule(readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports, window, process: { env },
    require: (name) => name === "react" ? hooks : dependencies[name] ?? require(name),
  });
  const component = Object.values(exports)[0];
  return {
    callbacks, effects,
    render(props) { cursor = 0; callbacks.length = 0; effects.length = 0; return component(props); },
  };
}

function nodes(tree) {
  const result = [];
  function visit(node) {
    if (!isValidElement(node)) return;
    result.push(node);
    Children.forEach(node.props.children, visit);
  }
  visit(tree);
  return result;
}

function find(tree, predicate) {
  const node = nodes(tree).find(predicate);
  assert.ok(node, "Expected UI control is present");
  return node;
}

function signInHarness({ result = "complete", failure = false, currentTask = null } = {}) {
  const calls = [];
  const signIn = {
    status: "needs_identifier",
    async password(values) {
      calls.push(["password", values]);
      if (failure) return { error: new Error("Invalid credentials") };
      signIn.status = result;
      return { error: null };
    },
    async finalize({ navigate }) {
      calls.push(["finalize"]);
      await navigate({ session: { currentTask }, decorateUrl: (url) => url });
      return { error: null };
    },
    async sso(values) { calls.push(["sso", values]); return { error: null }; },
    async create(values) { calls.push(["create", values]); signIn.status = "needs_first_factor"; return { error: null }; },
    reset() { calls.push(["reset"]); signIn.status = "needs_identifier"; },
  };
  const window = { location: { hash: "", assign: (url) => calls.push(["assign", url]) } };
  const errors = { fields: {}, global: null };
  const ClerkSignIn = () => null;
  const harness = componentHarness("sign-in-form.tsx", {
    "@clerk/react": {
      SignIn: ClerkSignIn,
      useSignIn: () => ({ signIn, errors, fetchStatus: "idle" }),
      useUser: () => ({ isLoaded: true, isSignedIn: false }),
      useSession: () => ({ session: null }),
      useClerk: () => ({ redirectToTasks: async (options) => calls.push(["tasks", options]) }),
    },
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useRouter: () => ({ replace: (url) => calls.push(["replace", url]) }) },
  }, window);
  function enterCredentials() {
    let tree = harness.render();
    find(tree, (node) => node.props.name === "email").props.onChange({ target: { value: " person@example.com " } });
    find(tree, (node) => node.props.name === "password").props.onChange({ target: { value: " password with spaces " } });
    tree = harness.render();
    return find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  }
  return { ...harness, calls, window, errors, signIn, ClerkSignIn, enterCredentials };
}

test("login presents both required credentials immediately and supports password managers", () => {
  const harness = signInHarness();
  let tree = harness.render();
  const email = find(tree, (node) => node.props.name === "email");
  const password = find(tree, (node) => node.props.name === "password");
  assert.equal(email.props.type, "email");
  assert.equal(email.props.autoComplete, "username");
  assert.equal(password.props.type, "password");
  assert.equal(password.props.autoComplete, "current-password");
  assert.ok(email.props.required && password.props.required);
  find(tree, (node) => node.props["aria-label"] === "Show password").props.onClick();
  tree = harness.render();
  assert.equal(find(tree, (node) => node.props.name === "password").props.type, "text");
});

test("login submits email and password together, then activates the session and returns to account", async () => {
  const harness = signInHarness();
  await harness.enterCredentials();
  assert.deepEqual(structuredClone(harness.calls), [
    ["password", { emailAddress: "person@example.com", password: " password with spaces " }],
    ["finalize"], ["replace", "/account"],
  ]);
  assert.equal(find(harness.render(), (node) => node.props.name === "password").props.value, "");
});

test("invalid credentials keep both inputs available, show feedback, and do not activate a session", async () => {
  const harness = signInHarness({ failure: true });
  await harness.enterCredentials();
  const tree = harness.render();
  assert.equal(harness.calls.length, 1);
  assert.equal(find(tree, (node) => node.props.name === "email").props.value, " person@example.com ");
  assert.equal(find(tree, (node) => node.props.name === "password").props.value, " password with spaces ");
  assert.match(find(tree, (node) => node.props.role === "alert").props.children, /Check your email and password/);
});

for (const [status, route] of [
  ["needs_second_factor", "/factor-two"], ["needs_client_trust", "/client-trust"],
  ["needs_protect_check", "/protect-check"], ["needs_new_password", "/reset-password"],
]) {
  test(`${status} remains handled by Clerk before session activation`, async () => {
    const harness = signInHarness({ result: status });
    await harness.enterCredentials();
    const tree = harness.render();
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.window.location.hash, route);
    assert.equal(find(tree, (node) => node.type === harness.ClerkSignIn).props.forceRedirectUrl, "/account");
    find(tree, (node) => node.props.className === "sign-in-back-link").props.onClick();
    assert.equal(find(harness.render(), (node) => node.props.name === "password").props.value, "");
  });
}

test("required session tasks finish before navigating to the account", async () => {
  const harness = signInHarness({ currentTask: { key: "reset-password" } });
  await harness.enterCredentials();
  assert.equal(harness.calls.at(-1)[0], "tasks");
  assert.equal(harness.calls.some(([method]) => method === "replace"), false);
});

test("Google uses the OAuth callback and verification links retain the native Clerk flow", async () => {
  const harness = signInHarness();
  let tree = harness.render();
  await find(tree, (node) => node.props.className === "sign-in-google").props.onClick();
  assert.equal(harness.calls[0][1].strategy, "oauth_google");
  assert.equal(harness.calls[0][1].redirectCallbackUrl, "/sign-in/sso-callback");
  harness.window.location.hash = "#/factor-one";
  tree = harness.render();
  assert.ok(find(tree, (node) => node.type === harness.ClerkSignIn));
  find(tree, (node) => node.props.className === "sign-in-back-link").props.onClick();
  assert.equal(harness.window.location.hash, "");
  assert.ok(find(harness.render(), (node) => node.props.name === "email"));
});

test("password recovery initializes the email attempt before opening Clerk's reset screen", async () => {
  const harness = signInHarness();
  let tree = harness.render();
  find(tree, (node) => node.props.name === "email").props.onChange({ target: { value: "person@example.com" } });
  tree = harness.render();
  find(tree, (node) => node.props.name === "email").props.ref.current = { reportValidity: () => true };
  await find(tree, (node) => node.props.children === "Forgot password?").props.onClick();
  assert.equal(harness.calls[0][0], "create");
  assert.equal(harness.calls[0][1].identifier, "person@example.com");
  assert.equal(harness.window.location.hash, "/factor-one?__clerk_reset_password=true");
  assert.ok(find(harness.render(), (node) => node.type === harness.ClerkSignIn));
});

function readinessHarness(runtime, status = { billingEnabled: false }, env = {}) {
  const window = { chrome: { runtime }, setTimeout, clearTimeout };
  const harness = componentHarness("account/account-readiness.tsx", {
    "@clerk/react": { useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user_test", getToken: async () => "test-token" }) },
    "../billing-status-context": { useBillingStatus: () => ({ status, loading: false, error: "" }) },
    "../chrome-icon": { ChromeIcon: () => null },
    "../extension-api": { ZENAIAN_EXTENSION_ID: "a".repeat(32), createExtensionPairing: async () => ({}) },
  }, window, env);
  return {
    ...harness,
    async check() { harness.render(); await harness.callbacks[0](); return harness.render(); },
  };
}

test("missing extension and Chrome's no-receiver error show a clickable Chrome install link", async () => {
  for (const runtime of [undefined, { lastError: { message: "Receiving end does not exist" }, sendMessage: (_id, _message, callback) => callback() }]) {
    const tree = await readinessHarness(runtime).check();
    assert.equal(tree.type, "a");
    assert.equal(tree.props.href, "https://chromewebstore.google.com/detail/gjofjefbhibmdjchpjlicihpaeihfpkp");
    assert.match(tree.props.className, /account-install-button/);
    assert.equal(find(tree, (node) => node.type === "span").props.children, "Add to Chrome");
    assert.equal(nodes(tree).some((node) => node.props.className === "account-status-dot"), false);
  }
});

test("connected extension readiness and exhausted quota keep their existing messages", async () => {
  const runtime = { sendMessage: (_id, _message, callback) => callback({ installed: true, connected: true, accountId: "user_test" }) };
  for (const [status, title] of [
    [{ billingEnabled: false }, "Ready - Pin Extension"],
    [{ billingEnabled: true, usage: { remaining: 0 } }, "Usage Limit Reached"],
  ]) {
    const tree = await readinessHarness(runtime, status).check();
    assert.equal(find(tree, (node) => node.type === "strong").props.children, title);
  }
});

test("the install button uses the published listing when its public URL is configured", async () => {
  const listing = "https://chromewebstore.google.com/detail/zenaian/" + "a".repeat(32);
  const tree = await readinessHarness(undefined, undefined, { NEXT_PUBLIC_CHROME_WEB_STORE_URL: listing }).check();
  assert.equal(tree.props.href, listing);
  assert.equal(tree.props.target, "_blank");
  assert.equal(tree.props.rel, "noopener noreferrer");
});

test("an installed extension with a pairing error stays disconnected, rather than offering installation", async () => {
  const runtime = { sendMessage: (_id, message, callback) => callback(message.type === "SNEAKSOLVE_EXTENSION_PING" ? { installed: true } : { ok: false }) };
  const tree = await readinessHarness(runtime).check();
  assert.equal(tree.type, "div");
  assert.equal(find(tree, (node) => node.type === "strong").props.children, "Extension Disconnected");
});

test("OAuth callbacks keep unfinished signup and verification on the themed website", () => {
  const Callback = () => null;
  const harness = componentHarness("sign-in/sso-callback/page.tsx", {
    "@clerk/react": { AuthenticateWithRedirectCallback: Callback },
    "../../auth-shell": { AuthShell: () => null },
  });
  const callback = find(harness.render(), (node) => node.type === Callback);
  assert.equal(callback.props.continueSignUpUrl, "/sign-up#/continue");
  assert.equal(callback.props.firstFactorUrl, "/sign-in#/factor-one");
  assert.equal(callback.props.secondFactorUrl, "/sign-in#/factor-two");
  assert.equal(callback.props.resetPasswordUrl, "/sign-in#/reset-password");
  assert.equal(callback.props.verifyEmailAddressUrl, "/sign-up#/verify-email-address");
  assert.equal(callback.props.verifyPhoneNumberUrl, "/sign-up#/verify-phone-number");
  assert.equal(callback.props.signInProtectCheckUrl, "/sign-in#/protect-check");
  assert.equal(callback.props.signUpProtectCheckUrl, "/sign-up#/protect-check");
  for (const name of ["signInForceRedirectUrl", "signUpForceRedirectUrl", "signInFallbackRedirectUrl", "signUpFallbackRedirectUrl"]) {
    assert.equal(callback.props[name], "/account");
  }
});

test("page and root failures offer retry without exposing exception details", () => {
  const Recovery = () => null;
  for (const path of ["error.tsx", "global-error.tsx"]) {
    let retries = 0;
    const reset = () => { retries += 1; };
    const harness = componentHarness(path, { "./recovery-page": { RecoveryPage: Recovery } });
    const page = harness.render({ error: new Error("private-provider-detail"), reset });
    const recovery = find(page, (node) => node.type === Recovery);
    assert.equal(recovery.props.onRetry, reset);
    assert.doesNotMatch(`${recovery.props.title} ${recovery.props.detail}`, /private-provider-detail/);
    recovery.props.onRetry();
    assert.equal(retries, 1);
    if (path === "global-error.tsx") {
      assert.equal(page.type, "html");
      assert.equal(find(page, (node) => node.type === "link").props.href, "/favicon.svg");
    }
  }
});

test("a ping timeout remains a connection error rather than claiming the extension is uninstalled", async () => {
  const runtime = { sendMessage: () => { throw new Error("The extension did not respond in time."); } };
  const tree = await readinessHarness(runtime).check();
  assert.equal(tree.type, "div");
  assert.equal(find(tree, (node) => node.type === "strong").props.children, "Extension Disconnected");
});
