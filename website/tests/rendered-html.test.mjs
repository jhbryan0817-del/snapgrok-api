import assert from "node:assert/strict";
import test from "node:test";

test("renders SnapGrok metadata and account navigation", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /SnapGrok/);
  assert.match(html, /Capture the question/);
  assert.match(html, /\/account/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("serves every account entry route", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("account-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const assets = {
    fetch: async () => new Response("Not found", { status: 404 }),
  };

  for (const pathname of [
    "/account?mode=sign-in",
    "/account?mode=sign-up",
    "/sign-in",
    "/sign-up",
  ]) {
    const response = await worker.fetch(
      new Request(`http://localhost${pathname}`, {
        headers: { accept: "text/html", host: "localhost" },
      }),
      { ASSETS: assets },
      { waitUntil() {}, passThroughOnException() {} },
    );

    assert.equal(response.status, 200, `${pathname} should render successfully`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.match(await response.text(), /SnapGrok/);
  }
});
