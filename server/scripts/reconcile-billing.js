import {
  createBillingRuntime,
  createConfig,
  validateRuntimeConfig,
} from "../src/server.js";

const config = createConfig();
validateRuntimeConfig(config);
if (config.billingMode === "off") {
  throw new Error("BILLING_MODE must be test or live for reconciliation.");
}

const billing = createBillingRuntime(config);
try {
  await billing.initialize();
  const result = await billing.reconcile();
  console.log(
    JSON.stringify({
      operation: "billing_reconciliation",
      ...result,
    }),
  );
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await billing.close();
}
