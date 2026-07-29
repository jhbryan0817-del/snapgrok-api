import assert from "node:assert/strict";
import test from "node:test";
import {
  isPaidPlanChange,
  planActionLabel,
} from "../app/pricing/plan-labels.js";

test("pricing labels reflect each authenticated current plan", () => {
  assert.equal(planActionLabel("free", "free", "Start free"), "Current plan");
  assert.equal(planActionLabel("plus", "free", "Choose Plus"), "Upgrade to Plus");
  assert.equal(planActionLabel("ultra", "free", "Choose Ultra"), "Upgrade to Ultra");

  assert.equal(planActionLabel("free", "plus", "Start free"), "Switch to Free");
  assert.equal(planActionLabel("plus", "plus", "Choose Plus"), "Current plan");
  assert.equal(planActionLabel("ultra", "plus", "Choose Ultra"), "Upgrade to Ultra");

  assert.equal(planActionLabel("free", "ultra", "Start free"), "Switch to Free");
  assert.equal(planActionLabel("plus", "ultra", "Choose Plus"), "Switch to Plus");
  assert.equal(planActionLabel("ultra", "ultra", "Choose Ultra"), "Current plan");
});

test("pricing labels retain public fallbacks before a plan is known", () => {
  assert.equal(planActionLabel("free", null, "Start free"), "Start free");
  assert.equal(planActionLabel("plus", null, "Choose Plus"), "Choose Plus");
  assert.equal(planActionLabel("ultra", null, "Choose Ultra"), "Choose Ultra");
});

test("only changes away from an existing paid plan are display-only", () => {
  assert.equal(isPaidPlanChange("plus", "free"), true);
  assert.equal(isPaidPlanChange("plus", "ultra"), true);
  assert.equal(isPaidPlanChange("ultra", "plus"), true);
  assert.equal(isPaidPlanChange("free", "plus"), false);
  assert.equal(isPaidPlanChange("plus", "plus"), false);
  assert.equal(isPaidPlanChange(null, "ultra"), false);
});
