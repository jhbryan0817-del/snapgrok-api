import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../protocol.js", import.meta.url), "utf8");
const context = vm.createContext({ self: {} });
vm.runInContext(source, context, { filename: "protocol.js" });
const protocol = context.self.SnapGrokProtocol;

test("token-only answers retain supported separator formats", () => {
  for (const [input, expected] of [
    ["A", ["A"]],
    ["A B", ["A", "B"]],
    ["A,B", ["A", "B"]],
    ["A, B and E", ["A", "B", "E"]],
    ["[E / C]", ["C", "E"]],
  ]) {
    const outcome = protocol.parseAnswer(input);
    assert.equal(outcome?.status, "answer", input);
    assert.deepEqual(Array.from(outcome.answers), expected, input);
  }
});

test("token-only answers reject malformed separators", () => {
  for (const input of ["AB", "A,,B", "A,", ",A", "A X"]) {
    assert.equal(protocol.parseAnswer(input), null, input);
  }
});

test("crafted token-only input is rejected in linear time", () => {
  const input = `${"A ".repeat(50_000)}X`;
  const started = performance.now();
  assert.equal(protocol.parseAnswer(input), null);
  const elapsedMs = performance.now() - started;
  assert.ok(elapsedMs < 500, `crafted input took ${elapsedMs.toFixed(1)} ms`);
});
