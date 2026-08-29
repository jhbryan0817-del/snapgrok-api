import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { createAnalysisJobManager } from "./analysis-jobs.js";
import { createAuthenticator } from "./auth.js";
import {
  createBillingService,
  createBypassBillingService,
} from "./billing-service.js";
import { createPostgresBillingStore } from "./whop-billing-store.js";
import { createDeviceSessionService } from "./device-auth.js";
import { createPostgresDeviceSessionStore } from "./device-session-store.js";
import { loadEnv } from "./env.js";
import { createWhopClient } from "./whop.js";
import {
  AdaptiveCapacityLimiter,
  UserRateLimiter,
  WeightedCapacityLimiter,
} from "./rate-limit.js";
import { analyzeScreenshot, getPrepaidBalance } from "./xai.js";
import { createPostgresPrivacyStore } from "./privacy-store.js";
import { createDeletionLedgerStore } from "./deletion-ledger-store.js";
import { observePostgresPool } from "./postgres-runtime.js";
import {
  createPrivacyService,
  requireRecentAuthentication,
  validateDeletionConfirmation,
} from "./privacy-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDirectory = path.resolve(__dirname, "..");
const serviceVersion = String(
  JSON.parse(readFileSync(path.join(projectDirectory, "package.json"), "utf8"))
    .version || "",
);
const { Pool } = pg;

loadEnv(path.join(projectDirectory, ".env"));

export function createConfig(environment = process.env) {
  const productionRuntime = String(environment.NODE_ENV || "").toLowerCase() === "production";
  const allowedOrigins = new Set(parseCsv(environment.ALLOWED_ORIGINS));
  const configuredAuthorizedParties = parseCsv(
    environment.CLERK_AUTHORIZED_PARTIES,
  );
  const model = String(environment.XAI_MODEL || "grok-4.5").trim();
  const configuredAllowedModels = parseCsv(environment.ALLOWED_XAI_MODELS);
  const extensionIds = parseCsv(environment.EXTENSION_IDS);
  const billingMode = enumFrom(
    environment,
    "BILLING_MODE",
    "off",
    new Set(["off", "test", "live"]),
  );
  const configuredRequireXaiZdr = strictBooleanFrom(
    environment,
    "REQUIRE_XAI_ZDR",
    productionRuntime,
  );
  const maxConcurrentRequestsGlobal = boundedInteger(
    environment,
    "MAX_CONCURRENT_REQUESTS_GLOBAL",
    40,
    1,
    200,
  );

  return {
    deploymentRevision: safeDeploymentRevision(
      environment.RENDER_GIT_COMMIT || environment.GIT_COMMIT,
    ),
    port: boundedInteger(environment, "PORT", 8787, 1, 65535),
    apiKey: String(environment.XAI_API_KEY || "").trim(),
    model,
    allowedModels: new Set(configuredAllowedModels.length ? configuredAllowedModels : [model]),
    timeoutMs: boundedInteger(
      environment,
      "XAI_TIMEOUT_MS",
      180000,
      1000,
      300000,
    ),
    managementTimeoutMs: boundedInteger(
      environment,
      "XAI_MANAGEMENT_TIMEOUT_MS",
      10000,
      1000,
      30000,
    ),
    xaiMaxStartsPerSecond: boundedInteger(
      environment,
      "XAI_MAX_STARTS_PER_SECOND",
      30,
      1,
      150,
    ),
    maxRequestBytes:
      boundedInteger(environment, "MAX_REQUEST_MB", 2, 1, 25) * 1024 * 1024,
    mockMode: strictBooleanFrom(environment, "MOCK_XAI", false),
    // Production inference always fails closed when xAI does not explicitly
    // confirm zero data retention. Non-production environments may opt into
    // the same enforcement for integration testing.
    requireXaiZdr: productionRuntime || configuredRequireXaiZdr,
    xaiZdrFailureThreshold: boundedInteger(
      environment,
      "XAI_ZDR_FAILURE_THRESHOLD",
      3,
      2,
      20,
    ),

    clerkJwtKey: normalizePem(environment.CLERK_JWT_KEY),
    clerkSecretKey: String(environment.CLERK_SECRET_KEY || "").trim(),
    clerkPublishableKey: String(
      environment.CLERK_PUBLISHABLE_KEY || "",
    ).trim(),
    clerkAudience: parseCsv(environment.CLERK_AUDIENCE),
    clerkTimeoutMs: boundedInteger(
      environment,
      "CLERK_TIMEOUT_MS",
      10000,
      1000,
      30000,
    ),
    requireProductionClerk: strictBooleanFrom(
      environment,
      "REQUIRE_PRODUCTION_CLERK",
      productionRuntime,
    ),
    clerkAuthorizedParties: configuredAuthorizedParties.length
      ? configuredAuthorizedParties
      : [...allowedOrigins],

    allowedOrigins,
    requireOrigin: strictBooleanFrom(
      environment,
      "REQUIRE_ALLOWED_ORIGIN",
      true,
    ),

    extensionDeviceAuthEnabled: strictBooleanFrom(
      environment,
      "ENABLE_EXTENSION_DEVICE_AUTH",
      productionRuntime,
    ),
    extensionIds,
    extensionSessionSigningKey: String(
      environment.EXTENSION_SESSION_SIGNING_KEY || "",
    ).trim(),
    websiteOrigin: String(environment.WEBSITE_ORIGIN || "")
      .trim()
      .replace(/\/$/, ""),
    extensionPairingTtlMs: boundedInteger(
      environment,
      "EXTENSION_PAIRING_TTL_MS",
      120000,
      30000,
      300000,
    ),
    extensionAccessTtlMs: boundedInteger(
      environment,
      "EXTENSION_ACCESS_TTL_MS",
      900000,
      60000,
      3600000,
    ),
    extensionRefreshTtlMs: boundedInteger(
      environment,
      "EXTENSION_REFRESH_TTL_MS",
      2592000000,
      3600000,
      7776000000,
    ),
    extensionRefreshGraceMs: boundedInteger(
      environment,
      "EXTENSION_REFRESH_GRACE_MS",
      30000,
      5000,
      120000,
    ),
    extensionClerkRecheckMs: boundedInteger(
      environment,
      "EXTENSION_CLERK_RECHECK_MS",
      2000,
      0,
      5000,
    ),
    extensionSessionTouchIntervalMs: boundedInteger(
      environment,
      "EXTENSION_SESSION_TOUCH_INTERVAL_MS",
      60000,
      5000,
      300000,
    ),
    analysisJobTimeoutMs: boundedInteger(
      environment,
      "ANALYSIS_JOB_TIMEOUT_MS",
      120000,
      30000,
      240000,
    ),
    analysisJobRetentionMs: boundedInteger(
      environment,
      "ANALYSIS_JOB_RETENTION_MS",
      120000,
      30000,
      600000,
    ),
    analysisPollIntervalMs: boundedInteger(
      environment,
      "ANALYSIS_POLL_INTERVAL_MS",
      750,
      250,
      5000,
    ),
    analysisPollWaitMs: boundedInteger(
      environment,
      "ANALYSIS_POLL_WAIT_MS",
      5000,
      0,
      5000,
    ),

    adminUserIds: new Set(parseCsv(environment.ADMIN_USER_IDS)),
    managementApiKey: String(environment.XAI_MANAGEMENT_API_KEY || ""),
    teamId: String(environment.XAI_TEAM_ID || ""),
    outputUsdPerMillionTokens: String(
      environment.XAI_OUTPUT_USD_PER_MILLION_TOKENS || "",
    ),

    rateLimitWindowMs: boundedInteger(
      environment,
      "RATE_LIMIT_WINDOW_MS",
      60000,
      1000,
      86400000,
    ),
    rateLimitMaxRequests: boundedInteger(
      environment,
      "RATE_LIMIT_MAX_REQUESTS",
      10,
      1,
      10000,
    ),
    maxConcurrentRequestsPerUser: boundedInteger(
      environment,
      "MAX_CONCURRENT_REQUESTS_PER_USER",
      1,
      1,
      10,
    ),
    globalRateLimitMaxRequests: boundedInteger(
      environment,
      "GLOBAL_RATE_LIMIT_MAX_REQUESTS",
      3000,
      1,
      100000,
    ),
    maxConcurrentRequestsGlobal,
    maxDistributedConcurrentAnalyses: boundedInteger(
      environment,
      "DISTRIBUTED_MAX_CONCURRENT_ANALYSES",
      maxConcurrentRequestsGlobal,
      1,
      1000,
    ),
    maxDistributedAnalysisStartsPerMinute: boundedInteger(
      environment,
      "DISTRIBUTED_MAX_ANALYSIS_STARTS_PER_MINUTE",
      300,
      1,
      10000,
    ),
    maxActiveAnalysisBytes:
      boundedInteger(environment, "MAX_ACTIVE_ANALYSIS_MB", 96, 16, 256) *
      1024 * 1024,
    adaptiveConcurrencyEnabled: strictBooleanFrom(
      environment,
      "ADAPTIVE_CONCURRENCY_ENABLED",
      true,
    ),
    adaptiveMinConcurrent: boundedInteger(
      environment,
      "ADAPTIVE_MIN_CONCURRENT",
      Math.min(10, maxConcurrentRequestsGlobal),
      1,
      200,
    ),
    adaptiveRecoveryMs: boundedInteger(
      environment,
      "ADAPTIVE_RECOVERY_MS",
      30000,
      5000,
      300000,
    ),
    adaptiveRssLimitBytes:
      boundedInteger(environment, "ADAPTIVE_RSS_LIMIT_MB", 358, 64, 2048) *
      1024 * 1024,
    adaptiveEventLoopP99Ms: boundedInteger(
      environment,
      "ADAPTIVE_EVENT_LOOP_P99_MS",
      100,
      20,
      2000,
    ),
    adaptiveDatabaseWaitingThreshold: boundedInteger(
      environment,
      "ADAPTIVE_DATABASE_WAITING_THRESHOLD",
      2,
      1,
      50,
    ),
    adaptiveSampleIntervalMs: boundedInteger(
      environment,
      "ADAPTIVE_SAMPLE_INTERVAL_MS",
      250,
      100,
      5000,
    ),
    adaptivePressureSamples: boundedInteger(
      environment,
      "ADAPTIVE_PRESSURE_SAMPLES",
      3,
      1,
      20,
    ),
    controlPlaneRateLimitMaxRequests: boundedInteger(
      environment,
      "CONTROL_PLANE_RATE_LIMIT_MAX_REQUESTS",
      3000,
      1,
      100000,
    ),
    controlPlaneMaxConcurrentRequests: boundedInteger(
      environment,
      "CONTROL_PLANE_MAX_CONCURRENT_REQUESTS",
      80,
      1,
      200,
    ),
    performanceLogsEnabled: strictBooleanFrom(
      environment,
      "PERFORMANCE_LOGS_ENABLED",
      productionRuntime,
    ),
    webhookRateLimitMaxRequests: boundedInteger(
      environment,
      "WEBHOOK_RATE_LIMIT_MAX_REQUESTS",
      60,
      1,
      10000,
    ),
    webhookMaxConcurrentRequests: boundedInteger(
      environment,
      "WEBHOOK_MAX_CONCURRENT_REQUESTS",
      10,
      1,
      100,
    ),
    maxTrackedRateLimitUsers: boundedInteger(
      environment,
      "MAX_TRACKED_RATE_LIMIT_USERS",
      50000,
      100,
      1000000,
    ),
    maxInstructionCharacters: boundedInteger(
      environment,
      "MAX_INSTRUCTION_CHARACTERS",
      8000,
      100,
      16000,
    ),
    maxShortcutNameCharacters: boundedInteger(
      environment,
      "MAX_SHORTCUT_NAME_CHARACTERS",
      100,
      1,
      200,
    ),
    requestBodyTimeoutMs: boundedInteger(
      environment,
      "REQUEST_BODY_TIMEOUT_MS",
      30000,
      1000,
      120000,
    ),
    headersTimeoutMs: boundedInteger(
      environment,
      "HEADERS_TIMEOUT_MS",
      15000,
      1000,
      60000,
    ),
    requestTimeoutMs: boundedInteger(
      environment,
      "REQUEST_TIMEOUT_MS",
      240000,
      10000,
      360000,
    ),
    shutdownTimeoutMs: boundedInteger(
      environment,
      "SHUTDOWN_TIMEOUT_MS",
      25000,
      1000,
      290000,
    ),
    keepAliveTimeoutMs: boundedInteger(
      environment,
      "KEEP_ALIVE_TIMEOUT_MS",
      5000,
      1000,
      30000,
    ),
    maxHeaderBytes: boundedInteger(
      environment,
      "MAX_HEADER_BYTES",
      16384,
      8192,
      65536,
    ),

    billingMode,
    billingTesterUserIds: new Set(
      parseCsv(environment.BILLING_TESTER_USER_IDS),
    ),
    billingWebsiteOrigin: String(
      environment.BILLING_WEBSITE_ORIGIN || "",
    ).trim().replace(/\/$/, ""),
    databaseUrl: String(environment.DATABASE_URL || "").trim(),
    databasePoolMax: boundedInteger(
      environment,
      "DATABASE_POOL_MAX",
      10,
      1,
      50,
    ),
    databaseConnectionTimeoutMs: boundedInteger(
      environment,
      "DATABASE_CONNECTION_TIMEOUT_MS",
      5000,
      1000,
      30000,
    ),
    databaseStatementTimeoutMs: boundedInteger(
      environment,
      "DATABASE_STATEMENT_TIMEOUT_MS",
      10000,
      1000,
      60000,
    ),
    databaseReadinessIntervalMs: boundedInteger(
      environment,
      "DATABASE_READINESS_INTERVAL_MS",
      10000,
      5000,
      300000,
    ),
    databaseReadinessFailureThreshold: boundedInteger(
      environment,
      "DATABASE_READINESS_FAILURE_THRESHOLD",
      2,
      1,
      10,
    ),
    whopApiKey: String(environment.WHOP_API_KEY || "").trim(),
    whopWebhookSecret: String(environment.WHOP_WEBHOOK_SECRET || "").trim(),
    whopCompanyId: String(environment.WHOP_COMPANY_ID || "").trim(),
    whopPlusPlanId: String(environment.WHOP_PLUS_PLAN_ID || "").trim(),
    whopPlusLegacyPlanIds: new Set(
      parseCsv(environment.WHOP_PLUS_LEGACY_PLAN_IDS),
    ),
    whopPlusProductId: String(environment.WHOP_PLUS_PRODUCT_ID || "").trim(),
    whopUltraPlanId: String(environment.WHOP_ULTRA_PLAN_ID || "").trim(),
    whopUltraLegacyPlanIds: new Set(
      parseCsv(environment.WHOP_ULTRA_LEGACY_PLAN_IDS),
    ),
    whopUltraProductId: String(environment.WHOP_ULTRA_PRODUCT_ID || "").trim(),
    whopWebhookToleranceSeconds: boundedInteger(
      environment,
      "WHOP_WEBHOOK_TOLERANCE_SECONDS",
      300,
      60,
      900,
    ),
    billingApiTimeoutMs: boundedInteger(
      environment,
      "BILLING_API_TIMEOUT_MS",
      10000,
      1000,
      30000,
    ),
    billingWebhookMaxBytes:
      boundedInteger(
        environment,
        "BILLING_WEBHOOK_MAX_KB",
        256,
        16,
        1024,
      ) * 1024,
    billingReservationTtlMs: boundedInteger(
      environment,
      "BILLING_RESERVATION_TTL_MS",
      300000,
      60000,
      900000,
    ),
    billingCheckoutTtlMs: boundedInteger(
      environment,
      "BILLING_CHECKOUT_TTL_MS",
      1800000,
      300000,
      3600000,
    ),
    billingReconciliationIntervalMs: boundedInteger(
      environment,
      "BILLING_RECONCILIATION_INTERVAL_MS",
      900000,
      300000,
      86400000,
    ),
    billingWebhookRetentionDays: boundedInteger(
      environment,
      "BILLING_WEBHOOK_RETENTION_DAYS",
      30,
      1,
      90,
    ),
    privacyArchiveHmacKey: String(
      environment.PRIVACY_ARCHIVE_HMAC_KEY || "",
    ).trim(),
    privacyArchiveHmacKeyVersion: boundedInteger(
      environment,
      "PRIVACY_ARCHIVE_HMAC_KEY_VERSION",
      1,
      1,
      2147483647,
    ),
    privacyArchivePreviousHmacKeys: parseVersionedSecrets(
      environment.PRIVACY_ARCHIVE_PREVIOUS_HMAC_KEYS,
    ),
    requireExternalDeletionLedger: strictBooleanFrom(
      environment,
      "REQUIRE_EXTERNAL_DELETION_LEDGER",
      productionRuntime,
    ),
    privacyDeletionLedgerDatabaseUrl: String(
      environment.PRIVACY_DELETION_LEDGER_DATABASE_URL || "",
    ).trim(),
    privacyDeletionLedgerEncryptionKey: String(
      environment.PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY || "",
    ).trim(),
    privacyDeletionLedgerEncryptionKeyVersion: boundedInteger(
      environment,
      "PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY_VERSION",
      1,
      1,
      2147483647,
    ),
    privacyDeletionLedgerPreviousEncryptionKeys: parseVersionedSecrets(
      environment.PRIVACY_DELETION_LEDGER_PREVIOUS_ENCRYPTION_KEYS,
      "PRIVACY_DELETION_LEDGER_PREVIOUS_ENCRYPTION_KEYS",
    ),
    privacyRecentAuthMaxAgeMinutes: boundedInteger(
      environment,
      "PRIVACY_RECENT_AUTH_MAX_AGE_MINUTES",
      10,
      1,
      60,
    ),
  };
}

export function validateRuntimeConfig(config) {
  const missing = [];

  if (!config.mockMode && !config.apiKey) missing.push("XAI_API_KEY");
  if (!config.clerkSecretKey) missing.push("CLERK_SECRET_KEY");
  if (!config.clerkPublishableKey) missing.push("CLERK_PUBLISHABLE_KEY");
  if (!config.clerkAuthorizedParties.length) {
    missing.push("CLERK_AUTHORIZED_PARTIES");
  }
  if (config.requireOrigin && config.allowedOrigins.size === 0) {
    missing.push("ALLOWED_ORIGINS");
  }

  if (missing.length) {
    throw new Error(
      `Required server configuration is missing: ${missing.join(", ")}.`,
    );
  }

  if (
    config.requireProductionClerk &&
    (
      !config.clerkSecretKey.startsWith("sk_live_") ||
      !config.clerkPublishableKey.startsWith("pk_live_")
    )
  ) {
    throw new Error(
      "Production Clerk enforcement requires matching sk_live_ and pk_live_ credentials.",
    );
  }

  if (config.requireProductionClerk && !config.requireOrigin) {
    throw new Error(
      "Production Clerk enforcement requires REQUIRE_ALLOWED_ORIGIN=true.",
    );
  }

  if (config.requireProductionClerk && config.mockMode) {
    throw new Error("MOCK_XAI cannot be enabled with production Clerk enforcement.");
  }

  if (
    !config.model ||
    !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(config.model) ||
    !config.allowedModels.has(config.model)
  ) {
    throw new Error(
      "XAI_MODEL must be a safe server-side model identifier included in ALLOWED_XAI_MODELS.",
    );
  }

  for (const model of config.allowedModels) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(model)) {
      throw new Error(`ALLOWED_XAI_MODELS contains an invalid model identifier: ${model}.`);
    }
  }

  for (const audience of config.clerkAudience) {
    if (
      audience.length > 200 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(audience)
    ) {
      throw new Error(`CLERK_AUDIENCE contains an invalid value: ${audience}.`);
    }
  }

  if (config.headersTimeoutMs > config.requestTimeoutMs) {
    throw new Error("HEADERS_TIMEOUT_MS cannot exceed REQUEST_TIMEOUT_MS.");
  }

  if (config.maxRequestBytes > config.maxActiveAnalysisBytes) {
    throw new Error("MAX_REQUEST_MB cannot exceed MAX_ACTIVE_ANALYSIS_MB.");
  }

  if (config.adaptiveMinConcurrent > config.maxConcurrentRequestsGlobal) {
    throw new Error(
      "ADAPTIVE_MIN_CONCURRENT cannot exceed MAX_CONCURRENT_REQUESTS_GLOBAL.",
    );
  }

  if (config.extensionDeviceAuthEnabled) {
    const missingExtensionAuth = [];
    for (const [name, value] of [
      ["DATABASE_URL", config.databaseUrl],
      ["WEBSITE_ORIGIN", config.websiteOrigin],
      ["EXTENSION_SESSION_SIGNING_KEY", config.extensionSessionSigningKey],
    ]) {
      if (!value) missingExtensionAuth.push(name);
    }
    if (config.extensionIds.length === 0) {
      missingExtensionAuth.push("EXTENSION_IDS");
    }
    if (missingExtensionAuth.length) {
      throw new Error(
        `Extension authentication configuration is missing: ${missingExtensionAuth.join(", ")}.`,
      );
    }
    if (
      config.extensionIds.some((id) => !/^[a-p]{32}$/.test(id)) ||
      new Set(config.extensionIds).size !== config.extensionIds.length
    ) {
      throw new Error(
        "EXTENSION_IDS must contain unique 32-character Chrome extension IDs.",
      );
    }
    let signingKeyBytes;
    try {
      signingKeyBytes = Buffer.from(
        config.extensionSessionSigningKey,
        "base64url",
      );
    } catch {
      signingKeyBytes = Buffer.alloc(0);
    }
    if (
      !/^[A-Za-z0-9_-]{43,180}$/.test(config.extensionSessionSigningKey) ||
      signingKeyBytes.length < 32
    ) {
      throw new Error(
        "EXTENSION_SESSION_SIGNING_KEY must be a base64url secret containing at least 32 bytes.",
      );
    }
    requireDatabaseUrl(config.databaseUrl);
    requireExactHttpsOrigin(config.websiteOrigin, "WEBSITE_ORIGIN");
    if (
      !config.allowedOrigins.has(config.websiteOrigin) ||
      !config.clerkAuthorizedParties.includes(config.websiteOrigin)
    ) {
      throw new Error(
        "WEBSITE_ORIGIN must be included in ALLOWED_ORIGINS and CLERK_AUTHORIZED_PARTIES.",
      );
    }
    for (const extensionId of config.extensionIds) {
      const extensionOrigin = `chrome-extension://${extensionId}`;
      if (!config.allowedOrigins.has(extensionOrigin)) {
        throw new Error(
          `ALLOWED_ORIGINS must include ${extensionOrigin}.`,
        );
      }
    }
  }

  if (config.billingMode !== "off") {
    const missingBilling = [];
    for (const [name, value] of [
      ["DATABASE_URL", config.databaseUrl],
      ["BILLING_WEBSITE_ORIGIN", config.billingWebsiteOrigin],
      ["WHOP_API_KEY", config.whopApiKey],
      ["WHOP_WEBHOOK_SECRET", config.whopWebhookSecret],
      ["WHOP_COMPANY_ID", config.whopCompanyId],
      ["WHOP_PLUS_PLAN_ID", config.whopPlusPlanId],
      ["WHOP_PLUS_PRODUCT_ID", config.whopPlusProductId],
      ["WHOP_ULTRA_PLAN_ID", config.whopUltraPlanId],
      ["WHOP_ULTRA_PRODUCT_ID", config.whopUltraProductId],
      ["PRIVACY_ARCHIVE_HMAC_KEY", config.privacyArchiveHmacKey],
    ]) {
      if (!value) missingBilling.push(name);
    }
    if (missingBilling.length) {
      throw new Error(
        `Billing configuration is missing: ${missingBilling.join(", ")}.`,
      );
    }
    if (
      config.billingMode === "test" &&
      config.billingTesterUserIds.size === 0
    ) {
      throw new Error(
        "BILLING_MODE=test requires at least one BILLING_TESTER_USER_IDS value.",
      );
    }
    for (const userId of config.billingTesterUserIds) {
      if (!/^user_[A-Za-z0-9]{10,80}$/.test(userId)) {
        throw new Error(
          "BILLING_TESTER_USER_IDS contains an invalid Clerk user ID.",
        );
      }
    }
    const whopIds = [
      [config.whopCompanyId, "biz"],
      [config.whopPlusPlanId, "plan"],
      [config.whopPlusProductId, "prod"],
      [config.whopUltraPlanId, "plan"],
      [config.whopUltraProductId, "prod"],
      ...[...config.whopPlusLegacyPlanIds].map((id) => [id, "plan"]),
      ...[...config.whopUltraLegacyPlanIds].map((id) => [id, "plan"]),
    ];
    const configuredPlanIds = [
      config.whopPlusPlanId,
      ...config.whopPlusLegacyPlanIds,
      config.whopUltraPlanId,
      ...config.whopUltraLegacyPlanIds,
    ];
    if (
      config.whopPlusLegacyPlanIds.size > 20 ||
      config.whopUltraLegacyPlanIds.size > 20 ||
      new Set(configuredPlanIds).size !== configuredPlanIds.length ||
      config.whopPlusProductId === config.whopUltraProductId ||
      whopIds.some(([value, prefix]) =>
        !new RegExp(`^${prefix}_[A-Za-z0-9_-]{6,120}$`).test(value)
      )
    ) {
      throw new Error(
        "Whop requires one company, distinct Plus/Ultra products, and unique valid current/legacy plan IDs (at most 20 legacy IDs per plan).",
      );
    }
    if (config.whopWebhookSecret.length < 24 || config.whopWebhookSecret.length > 256) {
      throw new Error("WHOP_WEBHOOK_SECRET must contain 24 to 256 characters.");
    }
    if (config.whopApiKey.length < 20 || config.whopApiKey.length > 512) {
      throw new Error("WHOP_API_KEY has an invalid length.");
    }
    validatePrivacyHmacConfig(config);
    if (config.requireExternalDeletionLedger) {
      const ledgerMissing = [];
      for (const [name, value] of [
        [
          "PRIVACY_DELETION_LEDGER_DATABASE_URL",
          config.privacyDeletionLedgerDatabaseUrl,
        ],
        [
          "PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY",
          config.privacyDeletionLedgerEncryptionKey,
        ],
      ]) {
        if (!value) ledgerMissing.push(name);
      }
      if (ledgerMissing.length) {
        throw new Error(
          `External deletion ledger configuration is missing: ${ledgerMissing.join(", ")}.`,
        );
      }
      validateDeletionLedgerConfig(config);
    }
    requireDatabaseUrl(config.databaseUrl);
    requireExactHttpsOrigin(
      config.billingWebsiteOrigin,
      "BILLING_WEBSITE_ORIGIN",
    );
    if (
      !config.allowedOrigins.has(config.billingWebsiteOrigin) ||
      !config.clerkAuthorizedParties.includes(config.billingWebsiteOrigin)
    ) {
      throw new Error(
        "BILLING_WEBSITE_ORIGIN must be included in ALLOWED_ORIGINS and CLERK_AUTHORIZED_PARTIES.",
      );
    }
    for (const requiredModel of ["grok-4.3", "grok-4.5"]) {
      if (!config.allowedModels.has(requiredModel)) {
        throw new Error(
          `Billing requires ${requiredModel} in ALLOWED_XAI_MODELS.`,
        );
      }
    }
  }

  for (const [name, origins] of [
    ["ALLOWED_ORIGINS", [...config.allowedOrigins]],
    ["CLERK_AUTHORIZED_PARTIES", config.clerkAuthorizedParties],
  ]) {
    const invalid = origins.find((origin) => !isExactSafeOrigin(origin));
    if (invalid) {
      throw new Error(
        `${name} contains an invalid origin: ${invalid}. Use an exact HTTPS, localhost, or chrome-extension origin without paths or wildcards.`,
      );
    }

    if (
      config.requireProductionClerk &&
      origins.some((origin) => origin.startsWith("http://"))
    ) {
      throw new Error(`${name} cannot contain HTTP origins in production.`);
    }
  }
}

export function createZenaianServer({
  config = createConfig(),
  authenticate,
  analyze = analyzeScreenshot,
  getBalance = getPrepaidBalance,
  limiter,
  globalLimiter,
  controlGlobalLimiter,
  memoryLimiter,
  adaptiveLimiter,
  mainDatabasePool,
  resolveAnalysisAccess,
  billing,
  deviceSessions,
  analysisJobs,
  privacy,
} = {}) {
  const ownsMainDatabasePool = !mainDatabasePool && Boolean(config.databaseUrl);
  const runtimeMainDatabasePool = mainDatabasePool || (
    config.databaseUrl ? createMainDatabasePool(config) : null
  );
  const authenticateRequest =
    authenticate ||
    createAuthenticator({
      secretKey: config.clerkSecretKey,
      publishableKey: config.clerkPublishableKey,
      jwtKey: config.clerkJwtKey,
      authorizedParties: config.clerkAuthorizedParties,
      audience: config.clerkAudience,
      timeoutMs: config.clerkTimeoutMs,
    });

  const userRateLimiter =
    limiter ||
    new UserRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      maxConcurrent: config.maxConcurrentRequestsPerUser,
      maxTrackedUsers: config.maxTrackedRateLimitUsers,
      scope: "user",
    });
  const analysisGlobalRequestLimiter =
    globalLimiter ||
    new UserRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.globalRateLimitMaxRequests,
      maxConcurrent: config.maxConcurrentRequestsGlobal,
      maxTrackedUsers: 1,
      scope: "global",
    });
  const controlGlobalRequestLimiter =
    controlGlobalLimiter ||
    new UserRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.controlPlaneRateLimitMaxRequests,
      maxConcurrent: config.controlPlaneMaxConcurrentRequests,
      maxTrackedUsers: 1,
      scope: "global",
    });
  const webhookRequestLimiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: config.webhookRateLimitMaxRequests,
    maxConcurrent: config.webhookMaxConcurrentRequests,
    maxTrackedUsers: 1,
    scope: "webhook",
  });
  const analysisMemoryLimiter = memoryLimiter || new WeightedCapacityLimiter({
    maxWeight: config.maxActiveAnalysisBytes,
    scope: "analysis-bytes",
  });
  const adaptiveAnalysisLimiter = adaptiveLimiter || new AdaptiveCapacityLimiter({
    maxConcurrent: config.maxConcurrentRequestsGlobal,
    minConcurrent: config.adaptiveConcurrencyEnabled
      ? Math.min(config.adaptiveMinConcurrent, config.maxConcurrentRequestsGlobal)
      : config.maxConcurrentRequestsGlobal,
    recoveryMs: config.adaptiveRecoveryMs,
  });
  const capacityMonitor = createCapacityMonitor({
    config,
    limiter: adaptiveAnalysisLimiter,
    databasePool: runtimeMainDatabasePool,
  });
  const databaseReadinessMonitor = createDatabaseReadinessMonitor({
    config,
    databasePool: runtimeMainDatabasePool,
  });
  const accountRequestLimiter = new UserRateLimiter({
    windowMs: 60000,
    maxRequests: 6,
    maxConcurrent: 1,
    maxTrackedUsers: config.maxTrackedRateLimitUsers,
    scope: "account",
  });
  let privacyService = privacy || null;
  const analyzeWithZdrSafety = async (input) => {
    await privacyService?.assertAnalysisAllowed?.();
    try {
      const result = await analyze(input);
      capacityMonitor.recordProviderSuccess();
      await privacyService?.recordZdrSuccess?.();
      return result;
    } catch (error) {
      capacityMonitor.recordProviderFailure(error);
      if (error?.code === "XAI_ZDR_REQUIRED") {
        const safety = await privacyService?.recordZdrFailure?.();
        privacyMaintenanceState.zdrSafety = safeZdrSafety(safety);
      }
      throw error;
    }
  };
  const privacyStore = !privacyService && config.billingMode !== "off"
    ? createPrivacyStoreRuntime(config, { pool: runtimeMainDatabasePool })
    : privacyService?.store || null;
  const deletionGuard = (userId) => privacyDeletionGuard({
    privacyService,
    privacyStore,
    userId,
  });
  const billingService = billing || createBillingRuntime(config, {
    deletionGuard,
    pool: runtimeMainDatabasePool,
  });
  const deviceSessionService = deviceSessions || createDeviceSessionRuntime(
    config,
    {
      pool: runtimeMainDatabasePool,
      assertUserAllowed: async (userId) => {
        if (privacyService) return privacyService.assertUserAllowed(userId);
        if (await deletionGuard(userId)) {
          throw httpError(
            403,
            "This account is unavailable because deletion was requested.",
            "ACCOUNT_DELETION_IN_PROGRESS",
          );
        }
        return true;
      },
    },
  );
  const analysisJobManager = analysisJobs || (
    deviceSessionService
      ? createAnalysisJobManager({
          analyze: analyzeWithZdrSafety,
          billingService,
          userRateLimiter,
          globalRequestLimiter: analysisGlobalRequestLimiter,
          performanceLogger: createAnalysisPerformanceLogger(
            config,
            capacityMonitor.snapshot,
          ),
          resolveAnalysisAccess,
          config,
        })
      : null
  );
  const accountAnalysisController = createAccountAnalysisController(
    analysisJobManager,
  );
  privacyService ||= privacyStore
    ? createPrivacyRuntime(config, {
        store: privacyStore,
        deviceSessions: deviceSessionService,
        analysisJobs: accountAnalysisController,
        userRateLimiter,
      })
    : null;

  const privacyMaintenanceState = {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    deletionBacklog: null,
    zdrSafety: null,
  };
  let lifecycleState = "ready";
  let privacyMaintenancePromise = null;
  const runPrivacyMaintenance = () => {
    if (!privacyService?.maintenance) return Promise.resolve(null);
    if (privacyMaintenancePromise) return privacyMaintenancePromise;
    privacyMaintenanceState.lastAttemptAt = new Date().toISOString();
    privacyMaintenancePromise = Promise.resolve()
      .then(() => privacyService.maintenance())
      .then((result) => {
        privacyMaintenanceState.lastSuccessAt = new Date().toISOString();
        privacyMaintenanceState.consecutiveFailures = 0;
        privacyMaintenanceState.deletionBacklog = safeDeletionBacklog(
          result?.deletionBacklog,
        );
        privacyMaintenanceState.zdrSafety = safeZdrSafety(result?.zdrSafety);
        return result;
      })
      .catch((error) => {
        privacyMaintenanceState.lastFailureAt = new Date().toISOString();
        privacyMaintenanceState.consecutiveFailures += 1;
        throw error;
      })
      .finally(() => {
        privacyMaintenancePromise = null;
      });
    return privacyMaintenancePromise;
  };

  const cleanupTimer = setInterval(
    () => {
      userRateLimiter.cleanupExpired?.();
      analysisGlobalRequestLimiter.cleanupExpired?.();
      controlGlobalRequestLimiter.cleanupExpired?.();
      webhookRequestLimiter.cleanupExpired?.();
      accountRequestLimiter.cleanupExpired?.();
      analysisJobManager?.cleanup();
      void deviceSessionService?.maintenance?.().catch((error) => {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            code: publicErrorCode(error),
            operation: "extension_auth_maintenance",
            ...publicMaintenanceDiagnostics(error),
          }),
        );
      });
      void billingService.maintenance?.().catch((error) => {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            code: publicErrorCode(error),
            operation: "billing_maintenance",
            ...publicMaintenanceDiagnostics(error),
          }),
        );
      });
      void runPrivacyMaintenance().catch((error) => {
        logPrivacyMaintenanceError(error);
      });
    },
    5 * 60 * 1000,
  );
  cleanupTimer.unref();

  const server = http.createServer(
    { maxHeaderSize: config.maxHeaderBytes },
    async (request, response) => {
      const requestId = randomUUID();
      const startedAt = Date.now();
      const url = new URL(request.url || "/", "http://api.invalid");

      if (request.method === "OPTIONS") {
        try {
          enforceOrigin(config, request);
          setCommonHeaders(config, request, response, requestId);
          response.writeHead(204);
          response.end();
        } catch (error) {
          sendJson(
            config,
            request,
            response,
            error.status || 403,
            { ok: false, error: error.message, code: error.code },
            requestId,
          );
        }
        return;
      }

      try {
        if (request.method === "GET" && url.pathname === "/api/health") {
          const maintenance = publicPrivacyMaintenance(
            privacyService,
            privacyMaintenanceState,
          );
          const database = databaseReadinessMonitor.publicSnapshot();
          const degraded = maintenance.status === "degraded" ||
            database.status === "degraded" ||
            database.status === "pending" ||
            lifecycleState !== "ready";
          sendJson(
            config,
            request,
            response,
            degraded ? 503 : 200,
            {
              ok: !degraded,
              version: serviceVersion,
              service: "zenaian-api",
              authRequired: true,
              persistentRequestStorage:
                config.billingMode === "off"
                  ? false
                  : "billing-metadata-only",
              billingMode: config.billingMode,
              extensionDeviceAuth: Boolean(deviceSessionService),
              privacyControls: Boolean(privacyService),
              privacyReady: Boolean(privacyService?.ready),
              maintenance,
              readiness: {
                status: degraded ? "degraded" : "ready",
                lifecycle: lifecycleState,
                database,
              },
              capacity: capacityMonitor.publicSnapshot(),
              ...(config.deploymentRevision
                ? { deploymentRevision: config.deploymentRevision }
                : {}),
            },
            requestId,
          );
          return;
        }

        if (lifecycleState !== "ready") {
          throw httpError(
            503,
            "The service is restarting. Please try again shortly.",
            "SERVICE_DRAINING",
            { retryAfterSeconds: 1 },
          );
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/extension/pairings"
        ) {
          enforceOrigin(config, request);
          enforceWebsiteOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            await privacyService?.assertUserAllowed(auth.userId);
            const body = await readJsonBody(config, request);
            validatePairingCreationRequest(body);
            const pairing = await deviceSessionService.createPairing({
              userId: auth.userId,
              clerkSessionId: auth.sessionId,
              extensionId: body.extensionId,
              nonce: body.nonce,
            });
            sendJson(
              config,
              request,
              response,
              201,
              { ok: true, ...pairing },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/extension/pairings/exchange"
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const body = await readJsonBody(config, request);
            validatePairingExchangeRequest(body);
            const session = await deviceSessionService.exchangePairing({
              pairingCode: body.pairingCode,
              nonce: body.nonce,
              requestOrigin: requestOrigin(request),
            });
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...session },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/extension/session/refresh"
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const body = await readJsonBody(config, request);
            validateRefreshRequest(body);
            const session = await deviceSessionService.refresh({
              refreshToken: body.refreshToken,
              requestOrigin: requestOrigin(request),
            });
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...session },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          (request.method === "GET" &&
            url.pathname === "/api/extension/session") ||
          (request.method === "POST" &&
            url.pathname === "/api/extension/session/verify")
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await deviceSessionService.authenticateAccess(request);
            if (request.method === "POST") {
              const body = await readJsonBody(config, request);
              requireEmptyObject(body, "Extension session verification request");
            }
            const [profile, status] = await Promise.all([
              deviceSessionService.profile(auth.userId),
              billingService.status(auth.userId),
            ]);
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, profile, ...publicExtensionAccountStatus(status) },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          (request.method === "DELETE" &&
            url.pathname === "/api/extension/session") ||
          (request.method === "POST" &&
            url.pathname === "/api/extension/session/revoke")
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await deviceSessionService.authenticateAccess(request);
            if (request.method === "POST") {
              const body = await readJsonBody(config, request);
              requireEmptyObject(body, "Extension session revocation request");
            }
            await deviceSessionService.revokeDeviceSession(auth.deviceSessionId);
            const cancelledJobs = analysisJobManager?.cancelForDevice(
              auth.deviceSessionId,
            ) || 0;
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, revoked: true, cancelledJobs },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "GET" &&
          url.pathname === "/api/extension/account/status"
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await deviceSessionService.authenticateAccess(request);
            if (!auth.userAllowedChecked) {
              await privacyService?.assertUserAllowed(auth.userId);
            }
            const status = await billingService.status(auth.userId);
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...publicExtensionAccountStatus(status) },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/extension/sessions/revoke"
        ) {
          enforceOrigin(config, request);
          enforceWebsiteOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            const body = await readJsonBody(config, request);
            if (Object.keys(body).length !== 0) {
              throw httpError(
                400,
                "Extension session revocation request must be empty.",
                "EXTENSION_REVOCATION_REQUEST_INVALID",
              );
            }
            const revoked = await deviceSessionService.revokeUserSessions(
              auth.userId,
            );
            const cancelledJobs = analysisJobManager?.cancelForUser(
              auth.userId,
              "The user signed out before analysis completed.",
            ) || 0;
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, revoked, cancelledJobs },
              requestId,
            );
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/analyze-jobs"
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          requireAnalysisJobManager(analysisJobManager);
          const admissionStartedAt = Date.now();
          let releaseGlobal = analysisGlobalRequestLimiter.acquire("analysis");
          let releaseAdaptive = null;
          let releaseMemory = null;
          let releaseUser = null;
          let admissionTransferred = false;
          let body = null;
          try {
            releaseAdaptive = adaptiveAnalysisLimiter.acquire();
            releaseMemory = analysisMemoryLimiter.acquire(
              analysisAdmissionWeight(config, request),
            );
            const auth = await deviceSessionService.authenticateAccess(request);
            if (!auth.userAllowedChecked) {
              await privacyService?.assertUserAllowed(auth.userId);
            }
            releaseUser = userRateLimiter.acquire(auth.userId);
            body = await readJsonBody(config, request);
            validateAnalyzeRequest(config, body);
            const job = await analysisJobManager.create({
              auth,
              body,
              requestId,
              ...(analysisJobManager.acceptsAdmission
                ? {
                    admission: {
                      startedAt: admissionStartedAt,
                      releaseGlobal,
                      releaseAdaptive,
                      releaseMemory,
                      releaseUser,
                      activeBytes:
                        analysisMemoryLimiter.snapshot?.().activeWeight || 0,
                      adaptiveLimit:
                        adaptiveAnalysisLimiter.snapshot?.().currentLimit || 0,
                    },
                  }
                : {}),
            });
            if (analysisJobManager.acceptsAdmission) {
              admissionTransferred = true;
              releaseGlobal = null;
              releaseAdaptive = null;
              releaseMemory = null;
              releaseUser = null;
            }
            body = null;
            sendJson(
              config,
              request,
              response,
              202,
              { ok: true, ...job },
              requestId,
            );
          } finally {
            clearSensitiveBody(body);
            if (!admissionTransferred) {
              releaseUser?.();
              releaseMemory?.();
              releaseAdaptive?.();
              releaseGlobal?.();
            }
          }
          return;
        }

        const analysisJobActionMatch =
          /^\/api\/analyze-jobs\/([0-9a-f-]{36})\/(poll|cancel)$/i.exec(
            url.pathname,
          );
        if (analysisJobActionMatch && request.method === "POST") {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          requireAnalysisJobManager(analysisJobManager);
          const releaseControl =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await deviceSessionService.authenticateAccess(request);
            if (!auth.userAllowedChecked) {
              await privacyService?.assertUserAllowed(auth.userId);
            }
            const body = await readJsonBody(config, request);
            requireEmptyObject(body, "Analysis job action request");
            if (analysisJobActionMatch[2].toLowerCase() === "cancel") {
              const result = analysisJobManager.cancel({
                jobId: analysisJobActionMatch[1],
                auth,
              });
              sendJson(
                config,
                request,
                response,
                200,
                { ok: true, ...result },
                requestId,
              );
            } else {
              const pollController = new AbortController();
              const abortPoll = () => pollController.abort();
              request.once("aborted", abortPoll);
              response.once("close", abortPoll);
              let result;
              try {
                result = analysisJobManager.poll
                  ? await analysisJobManager.poll({
                      jobId: analysisJobActionMatch[1],
                      auth,
                      waitMs: config.analysisPollWaitMs,
                      signal: pollController.signal,
                    })
                  : analysisJobManager.get({
                      jobId: analysisJobActionMatch[1],
                      auth,
                    });
              } finally {
                request.off("aborted", abortPoll);
                response.off("close", abortPoll);
              }
              sendJson(
                config,
                request,
                response,
                result.httpStatus,
                result.payload,
                requestId,
              );
            }
          } finally {
            releaseControl();
          }
          return;
        }

        const analysisJobMatch = /^\/api\/analyze-jobs\/([0-9a-f-]{36})$/i.exec(
          url.pathname,
        );
        if (
          analysisJobMatch &&
          (request.method === "GET" || request.method === "DELETE")
        ) {
          enforceOrigin(config, request);
          requireDeviceSessionService(deviceSessionService);
          requireAnalysisJobManager(analysisJobManager);
          const releaseControl =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await deviceSessionService.authenticateAccess(request);
            if (!auth.userAllowedChecked) {
              await privacyService?.assertUserAllowed(auth.userId);
            }
            if (request.method === "DELETE") {
              const result = analysisJobManager.cancel({
                jobId: analysisJobMatch[1],
                auth,
              });
              sendJson(
                config,
                request,
                response,
                200,
                { ok: true, ...result },
                requestId,
              );
            } else {
              const result = analysisJobManager.get({
                jobId: analysisJobMatch[1],
                auth,
              });
              sendJson(
                config,
                request,
                response,
                result.httpStatus,
                result.payload,
                requestId,
              );
            }
          } finally {
            releaseControl();
          }
          return;
        }

        if (
          request.method === "GET" &&
          url.pathname === "/api/privacy/export"
        ) {
          enforceOrigin(config, request);
          enforceWebsiteOrigin(config, request);
          requirePrivacyService(privacyService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            const releaseAccount = accountRequestLimiter.acquire(auth.userId);
            try {
              requireRecentAuthentication(
                auth,
                config.privacyRecentAuthMaxAgeMinutes,
              );
              const exported = await privacyService.exportData(auth.userId);
              sendJson(
                config,
                request,
                response,
                200,
                { ok: true, export: exported },
                requestId,
              );
            } finally {
              releaseAccount();
            }
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/privacy/delete-account"
        ) {
          enforceOrigin(config, request);
          enforceWebsiteOrigin(config, request);
          requirePrivacyService(privacyService);
          const releaseGlobal = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            const releaseAccount = accountRequestLimiter.acquire(auth.userId);
            try {
              requireRecentAuthentication(
                auth,
                config.privacyRecentAuthMaxAgeMinutes,
              );
              const body = await readJsonBody(config, request);
              validateDeletionConfirmation(body);
              const receipt = await privacyService.deleteAccount(auth.userId);
              sendJson(
                config,
                request,
                response,
                receipt.state === "complete" ? 200 : 202,
                { ok: true, ...receipt },
                requestId,
              );
            } finally {
              releaseAccount();
            }
          } finally {
            releaseGlobal();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/webhook"
        ) {
          const releaseWebhook = webhookRequestLimiter.acquire("billing-webhook");
          try {
            requireSingleRequestHeader(request, "webhook-id");
            requireSingleRequestHeader(request, "webhook-timestamp");
            requireSingleRequestHeader(request, "webhook-signature");
            const rawBody = await readRawBody(
              request,
              config.billingWebhookMaxBytes,
              config.requestBodyTimeoutMs,
              "application/json",
            );
            const result = await billingService.handleWebhook({
              rawBody,
              webhookId: request.headers["webhook-id"],
              webhookTimestamp: request.headers["webhook-timestamp"],
              webhookSignature: request.headers["webhook-signature"],
            });
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...result },
              requestId,
            );
          } finally {
            releaseWebhook();
          }
          return;
        }

        if (
          request.method === "GET" &&
          url.pathname === "/api/billing/status"
        ) {
          enforceOrigin(config, request);
          const releaseGlobalLimit =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            if (privacyService?.seedSubjectIdentity) {
              await privacyService.seedSubjectIdentity(auth.userId);
            } else {
              await privacyService?.assertUserAllowed(auth.userId);
            }
            const status = await billingService.status(auth.userId);
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...status },
              requestId,
            );
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (
          request.method === "GET" &&
          url.pathname === "/api/billing/history"
        ) {
          enforceOrigin(config, request);
          enforceBillingWebsiteOrigin(config, request);
          const releaseGlobalLimit =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            await privacyService?.assertUserAllowed(auth.userId);
            const history = await billingService.paymentHistory(auth.userId);
            sendJson(
              config,
              request,
              response,
              200,
              { ok: true, ...history },
              requestId,
            );
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/checkout"
        ) {
          enforceOrigin(config, request);
          enforceBillingWebsiteOrigin(config, request);
          const releaseGlobalLimit =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            const releaseAccount = accountRequestLimiter.acquire(auth.userId);
            try {
              const profile = await privacyService?.ensureSubjectIdentity(
                auth.userId,
              );
              const body = await readJsonBody(config, request);
              validateCheckoutRequest(body);
              const checkout = await billingService.createCheckout({
                userId: auth.userId,
                planId: body.plan,
                email: profile?.primaryEmail || body.email,
                name: profile
                  ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
                  : body.name,
              });
              sendJson(
                config,
                request,
                response,
                200,
                { ok: true, ...checkout },
                requestId,
              );
            } finally {
              releaseAccount();
            }
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/cancel"
        ) {
          enforceOrigin(config, request);
          enforceBillingWebsiteOrigin(config, request);
          const releaseGlobalLimit =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            const releaseAccount = accountRequestLimiter.acquire(auth.userId);
            try {
              await privacyService?.assertUserAllowed(auth.userId);
              const body = await readJsonBody(config, request);
              validateBillingPlanRequest(body, "cancellation");
              const cancellation = await billingService.cancelMembership({
                userId: auth.userId,
                planId: body.plan,
              });
              sendJson(
                config,
                request,
                response,
                200,
                { ok: true, ...cancellation },
                requestId,
              );
            } finally {
              releaseAccount();
            }
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (
          request.method === "POST" &&
          url.pathname === "/api/billing/reactivate"
        ) {
          enforceOrigin(config, request);
          enforceBillingWebsiteOrigin(config, request);
          const releaseGlobalLimit =
            controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);
            const releaseAccount = accountRequestLimiter.acquire(auth.userId);
            try {
              await privacyService?.assertUserAllowed(auth.userId);
              const body = await readJsonBody(config, request);
              validateBillingPlanRequest(body, "reactivation");
              const reactivation = await billingService.reactivateMembership({
                userId: auth.userId,
                planId: body.plan,
              });
              sendJson(
                config,
                request,
                response,
                200,
                { ok: true, ...reactivation },
                requestId,
              );
            } finally {
              releaseAccount();
            }
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/balance") {
          enforceOrigin(config, request);
          const releaseGlobalLimit = controlGlobalRequestLimiter.acquire("control-plane");
          try {
            const auth = await authenticateRequest(request);

            if (!config.adminUserIds.has(auth.userId)) {
              throw httpError(404, "Not found.", "NOT_FOUND");
            }

            const balance = await getBalance({
              managementApiKey: config.managementApiKey,
              teamId: config.teamId,
              outputUsdPerMillionTokens: config.outputUsdPerMillionTokens,
              timeoutMs: config.managementTimeoutMs,
            });

            sendJson(config, request, response, 200, balance, requestId);
          } finally {
            releaseGlobalLimit();
          }
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/analyze") {
          enforceOrigin(config, request);
          const releaseGlobalLimit = analysisGlobalRequestLimiter.acquire("analysis");
          let releaseAdaptive = null;
          let releaseMemory = null;
          try {
            releaseAdaptive = adaptiveAnalysisLimiter.acquire();
            releaseMemory = analysisMemoryLimiter.acquire(
              analysisAdmissionWeight(config, request),
            );
            const auth = await authenticateRequest(request);
            await privacyService?.assertUserAllowed(auth.userId);
            const releaseRateLimit = userRateLimiter.acquire(auth.userId);
            const downstreamController = new AbortController();
            const untrackAnalysis = accountAnalysisController.track(
              auth.userId,
              downstreamController,
            );
            let body = null;
            let access = null;
            let reservationSettled = false;

            const abortDownstream = () => {
              if (!response.writableEnded) {
                downstreamController.abort(
                  new DOMException("The extension disconnected.", "AbortError"),
                );
              }
            };

            request.once("aborted", abortDownstream);
            response.once("close", abortDownstream);

            try {
              body = await readJsonBody(config, request);
              validateAnalyzeRequest(config, body);

              access = validateAnalysisAccess(
                config,
                await (resolveAnalysisAccess
                  ? resolveAnalysisAccess({
                      userId: auth.userId,
                      sessionId: auth.sessionId,
                      organizationId: auth.organizationId || null,
                      operationId: body.operationId || null,
                      requestId,
                      defaultModel: config.model,
                    })
                  : billingService.reserveAnalysis({
                      userId: auth.userId,
                      operationId: body.operationId,
                      defaultModel: config.model,
                    })),
              );

              const result = await analyzeWithZdrSafety({
                apiKey: config.apiKey,
                model: access.model,
                timeoutMs: config.timeoutMs,
                imageDataUrl: body.imageDataUrl,
                instruction:
                  typeof body.instruction === "string"
                    ? body.instruction.trim()
                    : "",
                shortcutName: String(body.shortcutName || "").trim(),
                mockMode: config.mockMode,
                requireZeroDataRetention: config.requireXaiZdr,
                maxStartsPerSecond: config.xaiMaxStartsPerSecond,
                signal: downstreamController.signal,
              });

              await billingService.consumeAnalysis({
                userId: auth.userId,
                reservation: access.reservation || null,
              });
              reservationSettled = true;

              if (!downstreamController.signal.aborted && !response.writableEnded) {
                // Re-check Clerk after the potentially long xAI call. A session
                // ended while analysis was running must not receive the result.
                await authenticateRequest(request);
                await privacyService?.assertUserAllowed(auth.userId);
                sendJson(
                  config,
                  request,
                  response,
                  200,
                  { ok: true, ...result },
                  requestId,
                );
              }
            } finally {
              if (
                access?.reservation &&
                !reservationSettled
              ) {
                await billingService.releaseAnalysis({
                  userId: auth.userId,
                  reservation: access.reservation,
                }).catch((error) => {
                  console.error(
                    JSON.stringify({
                      timestamp: new Date().toISOString(),
                      requestId,
                      code: publicErrorCode(error),
                      operation: "billing_reservation_release",
                    }),
                  );
                });
              }
              request.off("aborted", abortDownstream);
              response.off("close", abortDownstream);
              untrackAnalysis();
              releaseRateLimit();
              clearSensitiveBody(body);
              body = null;
            }
          } finally {
            releaseMemory?.();
            releaseAdaptive?.();
            releaseGlobalLimit();
          }
          return;
        }

        throw httpError(404, "Not found.", "NOT_FOUND");
      } catch (error) {
        if (response.writableEnded || response.destroyed) return;

        const status = normalizeHttpStatus(error?.status);
        const retryAfterSeconds = Number(error?.retryAfterSeconds) || 0;
        const errorCode = publicErrorCode(error);

        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            requestId,
            method: request.method,
            path: url.pathname,
            status,
            code: errorCode,
            authReason: error?.authReason || undefined,
            durationMs: Date.now() - startedAt,
            ...publicMaintenanceDiagnostics(error),
          }),
        );

        sendJson(
          config,
          request,
          response,
          status,
          {
            ok: false,
            error: publicErrorMessage(error, url.pathname),
            code: errorCode,
            requestId,
            ...(publicQuota(error) ? { quota: publicQuota(error) } : {}),
            ...(publicReverification(error)
              ? { reverification: publicReverification(error) }
              : {}),
          },
          requestId,
          retryAfterSeconds ? { "Retry-After": retryAfterSeconds } : {},
        );
      }
    },
  );

  let analysisDrainPromise = null;
  let runtimeClosePromise = null;
  let shutdownPromise = null;
  const drainAnalyses = () => {
    analysisDrainPromise ||= Promise.resolve(
      accountAnalysisController.close(
        "The analysis service is restarting. Please try again shortly.",
      ),
    );
    return analysisDrainPromise;
  };
  const closeRuntimeServices = () => {
    runtimeClosePromise ||= (async () => {
      await Promise.allSettled([
        billingService.close?.() || Promise.resolve(),
        deviceSessionService?.close?.() || Promise.resolve(),
        privacyService?.close?.() || Promise.resolve(),
      ]);
      if (ownsMainDatabasePool) {
        await runtimeMainDatabasePool?.end?.();
      }
    })();
    return runtimeClosePromise;
  };
  server.once("close", () => {
    lifecycleState = "draining";
    clearInterval(cleanupTimer);
    capacityMonitor.close();
    databaseReadinessMonitor.close();
    void drainAnalyses().finally(closeRuntimeServices);
  });
  server.billingService = billingService;
  server.deviceSessionService = deviceSessionService;
  server.analysisJobManager = analysisJobManager;
  server.privacyService = privacyService;
  server.runPrivacyMaintenance = runPrivacyMaintenance;
  server.initializeReadiness = databaseReadinessMonitor.initialize;
  server.capacitySnapshot = capacityMonitor.snapshot;
  server.readinessSnapshot = () => ({
    lifecycle: lifecycleState,
    database: databaseReadinessMonitor.publicSnapshot(),
  });
  server.shutdown = ({ timeoutMs = config.shutdownTimeoutMs } = {}) => {
    if (shutdownPromise) return shutdownPromise;
    lifecycleState = "draining";
    capacityMonitor.close();
    databaseReadinessMonitor.close();
    shutdownPromise = (async () => {
      const deadline = Date.now() + timeoutMs;
      const draining = drainAnalyses();
      const closed = closeHttpServer(server, timeoutMs);
      await settleBeforeDeadline(Promise.allSettled([draining, closed]), deadline);
      await settleBeforeDeadline(closeRuntimeServices(), deadline);
    })();
    return shutdownPromise;
  };
  server.headersTimeout = config.headersTimeoutMs;
  server.requestTimeout = config.requestTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.maxHeadersCount = 64;
  return server;
}

export function createAccountAnalysisController(analysisJobs) {
  const directControllers = new Map();
  return {
    track(userId, controller) {
      const controllers = directControllers.get(userId) || new Set();
      controllers.add(controller);
      directControllers.set(userId, controllers);
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        controllers.delete(controller);
        if (!controllers.size) directControllers.delete(userId);
      };
    },
    cancelForUser(userId, reason) {
      let cancelled = Number(analysisJobs?.cancelForUser?.(userId, reason) || 0);
      const controllers = directControllers.get(userId);
      if (!controllers) return cancelled;
      for (const controller of controllers) {
        if (controller.signal.aborted) continue;
        controller.abort(new DOMException(String(reason || "Cancelled."), "AbortError"));
        cancelled += 1;
      }
      directControllers.delete(userId);
      return cancelled;
    },
    async close(reason = "The analysis service is stopping.") {
      for (const controllers of directControllers.values()) {
        for (const controller of controllers) {
          if (!controller.signal.aborted) {
            controller.abort(new DOMException(reason, "AbortError"));
          }
        }
      }
      directControllers.clear();
      await analysisJobs?.close?.();
    },
  };
}

function closeHttpServer(server, timeoutMs) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, timeoutMs);
    server.close(() => finish());
    server.closeIdleConnections?.();
  });
}

function settleBeforeDeadline(promise, deadline) {
  const remainingMs = Math.max(0, deadline - Date.now());
  if (remainingMs === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (completed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(completed);
    };
    const timeout = setTimeout(() => finish(false), remainingMs);
    Promise.resolve(promise).then(
      () => finish(true),
      () => finish(true),
    );
  });
}

// Compatibility aliases preserve the established test and integration API.
export const createSneakSolveServer = createZenaianServer;
export const createSnapGrokServer = createZenaianServer;

function createCapacityMonitor({ config, limiter, databasePool }) {
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  const pressureStreaks = { rss: 0, eventLoop: 0, database: 0 };
  let providerFailureStreak = 0;
  let closed = false;
  let latest = {
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    eventLoopP99Ms: 0,
    databaseTotal: Number(databasePool?.totalCount) || 0,
    databaseIdle: Number(databasePool?.idleCount) || 0,
    databaseWaiting: Number(databasePool?.waitingCount) || 0,
  };

  eventLoop.enable();
  const timer = setInterval(sample, config.adaptiveSampleIntervalMs);
  timer.unref();

  function sample() {
    if (closed) return;
    const p99 = Number(eventLoop.percentile(99)) / 1e6;
    latest = {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      eventLoopP99Ms: Number.isFinite(p99) ? Math.round(p99 * 100) / 100 : 0,
      databaseTotal: Number(databasePool?.totalCount) || 0,
      databaseIdle: Number(databasePool?.idleCount) || 0,
      databaseWaiting: Number(databasePool?.waitingCount) || 0,
    };
    eventLoop.reset();

    const active = limiter.snapshot().active;
    const rssBytes = latest.rssMb * 1024 * 1024;
    observe(
      "rss",
      active > 0 && rssBytes >= config.adaptiveRssLimitBytes,
      "rss",
      rssBytes >= config.adaptiveRssLimitBytes * 1.1,
    );
    observe(
      "eventLoop",
      active > 0 && latest.eventLoopP99Ms >= config.adaptiveEventLoopP99Ms,
      "event_loop",
      latest.eventLoopP99Ms >= config.adaptiveEventLoopP99Ms * 1.25,
    );
    observe(
      "database",
      active > 0 &&
        latest.databaseWaiting >= config.adaptiveDatabaseWaitingThreshold,
      "database_wait",
      latest.databaseWaiting >= config.adaptiveDatabaseWaitingThreshold * 2,
    );
  }

  function observe(key, pressured, reason, severe = false) {
    pressureStreaks[key] = pressured
      ? severe
        ? config.adaptivePressureSamples
        : pressureStreaks[key] + 1
      : 0;
    if (
      !config.adaptiveConcurrencyEnabled ||
      pressureStreaks[key] < config.adaptivePressureSamples
    ) return;
    pressureStreaks[key] = 0;
    const capacity = limiter.recordPressure(reason, {
      factor: 0.75,
      cooldownMs: config.adaptiveRecoveryMs,
    });
    logPressure(reason, capacity);
  }

  function logPressure(reason, capacity) {
    if (!config.performanceLogsEnabled) return;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "analysis_capacity_pressure",
      reason,
      adaptiveLimit: capacity.currentLimit,
      activeAnalyses: capacity.active,
      ...latest,
    }));
  }

  function recordProviderFailure(error) {
    const upstreamStatus = Number(error?.upstreamStatus);
    if (upstreamStatus === 429 || error?.code === "XAI_RATE_LIMITED") {
      providerFailureStreak += 1;
      if (!config.adaptiveConcurrencyEnabled) return;
      const cooldownMs = Math.max(
        config.adaptiveRecoveryMs,
        Math.min(120000, Number(error?.retryAfterMs) || 0),
      );
      const capacity = limiter.recordPressure("provider_rate_limit", {
        factor: 0.5,
        cooldownMs,
      });
      logPressure("provider_rate_limit", capacity);
      return;
    }
    if (upstreamStatus >= 500 || error?.code === "XAI_UNAVAILABLE") {
      providerFailureStreak += 1;
      if (config.adaptiveConcurrencyEnabled && providerFailureStreak >= 3) {
        providerFailureStreak = 0;
        const capacity = limiter.recordPressure("provider_unavailable", {
          factor: 0.75,
          cooldownMs: config.adaptiveRecoveryMs,
        });
        logPressure("provider_unavailable", capacity);
      }
    }
  }

  function recordProviderSuccess() {
    providerFailureStreak = 0;
  }

  function snapshot() {
    return {
      ...latest,
      adaptive: limiter.snapshot(),
    };
  }

  function publicSnapshot() {
    const adaptive = limiter.snapshot();
    return {
      status: adaptive.currentLimit < adaptive.maxConcurrent
        ? "protecting"
        : "normal",
      currentLimit: adaptive.currentLimit,
      maximumLimit: adaptive.maxConcurrent,
      pressureReason: adaptive.lastPressureReason,
      coordination: config.billingMode === "off" ? "instance" : "database",
    };
  }

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    eventLoop.disable();
  }

  return {
    close,
    publicSnapshot,
    recordProviderFailure,
    recordProviderSuccess,
    snapshot,
  };
}

function createDatabaseReadinessMonitor({ config, databasePool }) {
  const enabled = Boolean(
    config.databaseUrl && typeof databasePool?.query === "function",
  );
  let status = enabled ? "pending" : "disabled";
  let consecutiveFailures = 0;
  let lastSuccessAt = null;
  let lastFailureAt = null;
  let timer = null;
  let initializePromise = null;
  let closed = false;

  async function probe({ failStartup = false } = {}) {
    if (!enabled || closed) return;
    try {
      await databasePool.query("SELECT 1 AS ready");
      const previous = status;
      status = "healthy";
      consecutiveFailures = 0;
      lastSuccessAt = new Date().toISOString();
      if (previous === "degraded") logTransition("recovered");
    } catch (error) {
      consecutiveFailures += 1;
      lastFailureAt = new Date().toISOString();
      if (
        failStartup ||
        consecutiveFailures >= config.databaseReadinessFailureThreshold
      ) {
        const previous = status;
        status = "degraded";
        if (previous !== "degraded") logTransition("degraded", error);
      }
      if (failStartup) throw error;
    }
  }

  function initialize() {
    if (!enabled || closed) return Promise.resolve();
    initializePromise ||= (async () => {
      await probe({ failStartup: true });
      if (closed || timer) return;
      timer = setInterval(
        () => void probe(),
        config.databaseReadinessIntervalMs,
      );
      timer.unref();
    })();
    return initializePromise;
  }

  function logTransition(next, error = null) {
    const output = {
      timestamp: new Date().toISOString(),
      event: "database_readiness_changed",
      status: next,
      consecutiveFailures,
      ...(error ? { code: publicErrorCode(error) } : {}),
    };
    if (next === "degraded") {
      console.error(JSON.stringify(output));
    } else {
      console.log(JSON.stringify(output));
    }
  }

  function publicSnapshot() {
    return {
      status,
      ...(lastSuccessAt ? { lastSuccessAt } : {}),
      ...(lastFailureAt ? { lastFailureAt } : {}),
    };
  }

  function close() {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
  }

  return { close, initialize, publicSnapshot };
}

function validateAnalysisAccess(config, access) {
  if (!access || access.allowed !== true) {
    throw httpError(403, "Analysis access is not available.", "ANALYSIS_ACCESS_DENIED");
  }
  if (
    typeof access.model !== "string" ||
    !config.allowedModels.has(access.model)
  ) {
    throw httpError(
      500,
      "Analysis access returned an unsupported model.",
      "ANALYSIS_ACCESS_INVALID",
    );
  }
  return {
    model: access.model,
    reservation: access.reservation || null,
    planId: access.planId || "legacy",
  };
}

export function createMainDatabasePool(config) {
  return observePostgresPool(new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: config.databaseStatementTimeoutMs,
    query_timeout: config.databaseStatementTimeoutMs,
    application_name: "zenaian-runtime",
  }), "main-runtime");
}

export function createDeviceSessionRuntime(
  config,
  { assertUserAllowed = async () => true, pool = null } = {},
) {
  if (!config.extensionDeviceAuthEnabled) return null;
  const store = createPostgresDeviceSessionStore({
    connectionString: config.databaseUrl,
    pool,
    poolMax: config.databasePoolMax,
    connectionTimeoutMs: config.databaseConnectionTimeoutMs,
    statementTimeoutMs: config.databaseStatementTimeoutMs,
  });
  return createDeviceSessionService({
    store,
    signingKey: config.extensionSessionSigningKey,
    extensionIds: config.extensionIds,
    clerkSecretKey: config.clerkSecretKey,
    clerkPublishableKey: config.clerkPublishableKey,
    clerkTimeoutMs: config.clerkTimeoutMs,
    pairingTtlMs: config.extensionPairingTtlMs,
    accessTtlMs: config.extensionAccessTtlMs,
    refreshTtlMs: config.extensionRefreshTtlMs,
    refreshGraceMs: config.extensionRefreshGraceMs,
    clerkRecheckMs: config.extensionClerkRecheckMs,
    sessionTouchIntervalMs: config.extensionSessionTouchIntervalMs,
    assertUserAllowed,
  });
}

export function createPrivacyStoreRuntime(config, { pool = null } = {}) {
  return createPostgresPrivacyStore({
    connectionString: config.databaseUrl,
    pool,
    providerMode: config.billingMode,
    poolMax: Math.min(config.databasePoolMax, 4),
    connectionTimeoutMs: config.databaseConnectionTimeoutMs,
    statementTimeoutMs: config.databaseStatementTimeoutMs,
    hmacKey: config.privacyArchiveHmacKey,
    hmacKeyVersion: config.privacyArchiveHmacKeyVersion,
    previousHmacKeys: config.privacyArchivePreviousHmacKeys,
  });
}

export function createPrivacyRuntime(
  config,
  { store, deviceSessions, analysisJobs, userRateLimiter } = {},
) {
  if (config.billingMode === "off") return null;
  const whopClient = createWhopClient({
    apiKey: config.whopApiKey,
    companyId: config.whopCompanyId,
    mode: config.billingMode,
    timeoutMs: config.billingApiTimeoutMs,
  });
  const deletionLedger = config.privacyDeletionLedgerDatabaseUrl
    ? createDeletionLedgerStore({
        connectionString: config.privacyDeletionLedgerDatabaseUrl,
        encryptionKey: config.privacyDeletionLedgerEncryptionKey,
        encryptionKeyVersion:
          config.privacyDeletionLedgerEncryptionKeyVersion,
        previousEncryptionKeys:
          config.privacyDeletionLedgerPreviousEncryptionKeys,
        poolMax: 2,
        connectionTimeoutMs: config.databaseConnectionTimeoutMs,
        statementTimeoutMs: config.databaseStatementTimeoutMs,
      })
    : null;
  return createPrivacyService({
    store: store || createPrivacyStoreRuntime(config),
    clerkSecretKey: config.clerkSecretKey,
    clerkPublishableKey: config.clerkPublishableKey,
    clerkTimeoutMs: config.clerkTimeoutMs,
    whopClient,
    deviceSessions,
    analysisJobs,
    userRateLimiter,
    deletionLedger,
    billingConfig: config,
  });
}

export function createBillingRuntime(
  config,
  { deletionGuard = null, pool = null } = {},
) {
  if (config.billingMode === "off") {
    return createBypassBillingService(config);
  }
  const store = createPostgresBillingStore({
    connectionString: config.databaseUrl,
    pool,
    providerMode: config.billingMode,
    poolMax: config.databasePoolMax,
    connectionTimeoutMs: config.databaseConnectionTimeoutMs,
    statementTimeoutMs: config.databaseStatementTimeoutMs,
    globalConcurrentReservationLimit:
      config.maxDistributedConcurrentAnalyses,
    globalStartsPerMinuteLimit:
      config.maxDistributedAnalysisStartsPerMinute,
    reservationTtlMs: config.billingReservationTtlMs,
    deletionGuard,
  });
  const whopClient = createWhopClient({
    apiKey: config.whopApiKey,
    companyId: config.whopCompanyId,
    mode: config.billingMode,
    timeoutMs: config.billingApiTimeoutMs,
  });
  return createBillingService({ config, store, whopClient });
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function normalizePem(value) {
  return String(value || "").trim().replace(/\\n/g, "\n");
}

function isExactSafeOrigin(value) {
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(value)) return true;

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.origin !== value || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

function parseVersionedSecrets(
  value,
  name = "PRIVACY_ARCHIVE_PREVIOUS_HMAC_KEYS",
) {
  const entries = [];
  for (const item of parseCsv(value)) {
    const separator = item.indexOf(":");
    const versionText = item.slice(0, separator);
    const key = item.slice(separator + 1);
    if (!/^\d+$/.test(versionText) || !key) {
      throw new Error(
        `${name} must use version:base64url entries.`,
      );
    }
    entries.push({ version: Number(versionText), key });
  }
  return entries;
}

function validateDeletionLedgerConfig(config) {
  const entries = [
    {
      version: config.privacyDeletionLedgerEncryptionKeyVersion,
      key: config.privacyDeletionLedgerEncryptionKey,
    },
    ...config.privacyDeletionLedgerPreviousEncryptionKeys,
  ];
  if (
    new Set(entries.map((entry) => entry.version)).size !== entries.length ||
    entries.some((entry) => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(entry.key)) return true;
      try { return Buffer.from(entry.key, "base64url").length !== 32; }
      catch { return true; }
    })
  ) {
    throw new Error(
      "Deletion-ledger encryption keys must be unique versioned 32-byte base64url secrets.",
    );
  }
  const main = postgresDatabaseBoundary(config.databaseUrl, "DATABASE_URL");
  const ledger = postgresDatabaseBoundary(
    config.privacyDeletionLedgerDatabaseUrl,
    "PRIVACY_DELETION_LEDGER_DATABASE_URL",
  );
  if (main.host === ledger.host && main.database === ledger.database) {
    throw new Error(
      "PRIVACY_DELETION_LEDGER_DATABASE_URL must be outside the main database restore boundary.",
    );
  }
}

function postgresDatabaseBoundary(value, name) {
  let url;
  try { url = new URL(value); } catch {
    throw new Error(`${name} must be a PostgreSQL connection URL.`);
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error(`${name} must be a PostgreSQL connection URL.`);
  }
  return {
    host: `${url.hostname}:${url.port || "5432"}`,
    database: url.pathname,
  };
}

function validatePrivacyHmacConfig(config) {
  const entries = [
    {
      version: config.privacyArchiveHmacKeyVersion,
      key: config.privacyArchiveHmacKey,
    },
    ...config.privacyArchivePreviousHmacKeys,
  ];
  if (
    new Set(entries.map((entry) => entry.version)).size !== entries.length ||
    entries.some((entry) => {
      if (!/^[A-Za-z0-9_-]{43,180}$/.test(entry.key)) return true;
      try {
        return Buffer.from(entry.key, "base64url").length < 32;
      } catch {
        return true;
      }
    })
  ) {
    throw new Error(
      "Privacy archive HMAC keys must be unique versioned base64url secrets containing at least 32 random bytes.",
    );
  }
}

async function privacyDeletionGuard({ privacyService, privacyStore, userId }) {
  if (privacyStore?.isDeletionBlocked) {
    return Boolean(await privacyStore.isDeletionBlocked(userId));
  }
  if (!privacyService?.assertUserAllowed) return false;
  try {
    await privacyService.assertUserAllowed(userId);
    return false;
  } catch (error) {
    if (error?.code === "ACCOUNT_DELETION_IN_PROGRESS") return true;
    throw error;
  }
}

function requireExactHttpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an exact HTTPS origin.`);
  }
}

function requireDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
}

function boundedInteger(environment, name, fallback, minimum, maximum) {
  const raw = environment[name];
  if (raw == null || raw === "") return fallback;
  if (!/^\d+$/.test(String(raw).trim())) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function enumFrom(environment, name, fallback, allowed) {
  const value = String(environment[name] || fallback).trim().toLowerCase();
  if (!allowed.has(value)) {
    throw new Error(`${name} must be one of: ${[...allowed].join(", ")}.`);
  }
  return value;
}

function strictBooleanFrom(environment, name, fallback) {
  const value = environment[name];
  if (value == null || value === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false.`);
}

function createAnalysisPerformanceLogger(config, capacitySnapshot = null) {
  if (!config.performanceLogsEnabled) return null;
  return (metrics) => {
    try {
      const totalMs = safePerformanceMetric(metrics?.totalMs);
      const xaiMs = safePerformanceMetric(metrics?.xaiMs);
      const capacity = capacitySnapshot?.() || {};
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "analysis_performance",
        transport: metrics?.transport === "async-job" ? "async-job" : "unknown",
        status: ["complete", "failed", "cancelled"].includes(metrics?.status)
          ? metrics.status
          : "unknown",
        totalMs,
        nonXaiMs: Math.max(0, totalMs - xaiMs),
        admissionMs: safePerformanceMetric(metrics?.admissionMs),
        accessMs: safePerformanceMetric(metrics?.accessMs),
        xaiMs,
        settlementMs: safePerformanceMetric(metrics?.settlementMs),
        requestBytes: safePerformanceMetric(metrics?.requestBytes),
        activeAtStart: safePerformanceMetric(metrics?.activeAtStart),
        activeBytesAtStart: safePerformanceMetric(metrics?.activeBytesAtStart),
        adaptiveLimitAtStart: safePerformanceMetric(metrics?.adaptiveLimitAtStart),
        activeAfter: safePerformanceMetric(metrics?.activeAfter),
        adaptiveLimitAfter: safePerformanceMetric(
          capacity?.adaptive?.currentLimit,
        ),
        rssMb: safePerformanceMetric(capacity?.rssMb),
        eventLoopP99Ms: safePerformanceMetric(capacity?.eventLoopP99Ms),
        databasePoolTotal: safePerformanceMetric(capacity?.databaseTotal),
        databasePoolIdle: safePerformanceMetric(capacity?.databaseIdle),
        databasePoolWaiting: safePerformanceMetric(capacity?.databaseWaiting),
      }));
    } catch {
      // Performance diagnostics must never affect request processing.
    }
  };
}

function safePerformanceMetric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function safeDeploymentRevision(value) {
  const revision = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{7,40}$/.test(revision) ? revision : "";
}

function httpError(status, message, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

function requestOrigin(request) {
  return String(request.headers.origin || "").trim().replace(/\/$/, "");
}

function isOriginAllowed(config, origin) {
  return Boolean(origin && config.allowedOrigins.has(origin));
}

function setCommonHeaders(config, request, response, requestId) {
  const origin = requestOrigin(request);
  if (isOriginAllowed(config, origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (requestId) response.setHeader("X-Request-ID", requestId);
}

function publicExtensionAccountStatus(status) {
  if (!status?.plan || !status?.usage) {
    return { plan: null, usage: null };
  }
  const allowance = Number(status.usage.allowance);
  const remaining = Number(status.usage.remaining);
  if (
    !Number.isSafeInteger(allowance) ||
    allowance < 0 ||
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    remaining > allowance
  ) {
    return { plan: null, usage: null };
  }
  return {
    plan: {
      id: String(status.plan.id || ""),
    },
    usage: {
      allowance,
      remaining,
    },
  };
}

function sendJson(config, request, response, status, body, requestId, headers = {}) {
  setCommonHeaders(config, request, response, requestId);
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && value !== "") {
      response.setHeader(name, String(value));
    }
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function enforceOrigin(config, request) {
  requireSingleRequestHeader(request, "origin");
  const origin = requestOrigin(request);
  if (!origin) {
    if (config.requireOrigin) {
      throw httpError(403, "Request origin is missing.", "ORIGIN_REQUIRED");
    }
    return;
  }
  if (!isOriginAllowed(config, origin)) {
    throw httpError(403, "Request origin is not allowed.", "ORIGIN_NOT_ALLOWED");
  }
}

function enforceBillingWebsiteOrigin(config, request) {
  if (requestOrigin(request) !== config.billingWebsiteOrigin) {
    throw httpError(
      403,
      "Billing actions are only available from the Zenaian website.",
      "BILLING_ORIGIN_NOT_ALLOWED",
    );
  }
}

function enforceWebsiteOrigin(config, request) {
  if (requestOrigin(request) !== config.websiteOrigin) {
    throw httpError(
      403,
      "Extension account linking is only available from the Zenaian website.",
      "WEBSITE_ORIGIN_NOT_ALLOWED",
    );
  }
}

function requireDeviceSessionService(service) {
  if (!service) {
    throw httpError(
      503,
      "Extension authentication is not enabled.",
      "EXTENSION_AUTH_UNAVAILABLE",
    );
  }
}

function requirePrivacyService(service) {
  if (!service) {
    throw httpError(
      503,
      "Privacy controls are temporarily unavailable.",
      "PRIVACY_SERVICE_UNAVAILABLE",
    );
  }
}

function requireAnalysisJobManager(manager) {
  if (!manager) {
    throw httpError(
      503,
      "Asynchronous analysis is not enabled.",
      "ANALYSIS_JOBS_UNAVAILABLE",
    );
  }
}

async function readRawBody(
  request,
  maximumBytes,
  timeoutMs,
  expectedContentType,
) {
  requireSingleRequestHeader(request, "content-type");
  requireSingleRequestHeader(request, "content-length");
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== expectedContentType) {
    throw httpError(
      415,
      `Content-Type must be ${expectedContentType}.`,
      "UNSUPPORTED_CONTENT_TYPE",
    );
  }
  const contentLength = request.headers["content-length"];
  if (contentLength != null) {
    if (!/^(?:0|[1-9]\d*)$/.test(String(contentLength))) {
      throw httpError(400, "Content-Length is invalid.", "INVALID_CONTENT_LENGTH");
    }
    if (Number(contentLength) > maximumBytes) {
      throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
    }
  }

  const chunks = [];
  let total = 0;
  const timeout = setTimeout(() => {
    request.destroy(
      httpError(408, "Request body timed out.", "REQUEST_BODY_TIMEOUT"),
    );
  }, timeoutMs);
  try {
    for await (const chunk of request) {
      total += chunk.length;
      if (total > maximumBytes) {
        throw httpError(413, "Request body is too large.", "REQUEST_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!chunks.length) {
    throw httpError(400, "Request body is required.", "REQUEST_BODY_MISSING");
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(config, request) {
  requireSingleRequestHeader(request, "content-type");
  requireSingleRequestHeader(request, "content-length");
  const contentType = String(request.headers["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw httpError(415, "Content-Type must be application/json.", "UNSUPPORTED_CONTENT_TYPE");
  }

  const contentLengthHeader = request.headers["content-length"];
  if (contentLengthHeader != null) {
    if (!/^(?:0|[1-9]\d*)$/.test(String(contentLengthHeader))) {
      throw httpError(400, "Content-Length is invalid.", "INVALID_CONTENT_LENGTH");
    }
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > config.maxRequestBytes
    ) {
      throw requestTooLarge(config);
    }
  }

  const chunks = [];
  let total = 0;
  const timeout = setTimeout(() => {
    request.destroy(
      httpError(408, "Request body timed out.", "REQUEST_BODY_TIMEOUT"),
    );
  }, config.requestBodyTimeoutMs);
  try {
    for await (const chunk of request) {
      total += chunk.length;
      if (total > config.maxRequestBytes) throw requestTooLarge(config);
      chunks.push(chunk);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!chunks.length) {
    throw httpError(400, "Request body is required.", "REQUEST_BODY_MISSING");
  }

  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not-an-object");
    }
    return body;
  } catch {
    throw httpError(400, "Request body must be a JSON object.", "INVALID_JSON");
  }
}

function requestTooLarge(config) {
  return httpError(
    413,
    `Request exceeds ${Math.round(config.maxRequestBytes / 1024 / 1024)} MB.`,
    "REQUEST_TOO_LARGE",
  );
}

function validateAnalyzeRequest(config, body) {
  if (!isValidImageDataUrl(body.imageDataUrl)) {
    throw httpError(
      400,
      "imageDataUrl must be a base64 JPEG, PNG, or WebP image data URL.",
      "INVALID_IMAGE",
    );
  }

  if (
    body.instruction !== undefined &&
    typeof body.instruction !== "string"
  ) {
    throw httpError(
      400,
      "instruction must be a string when provided.",
      "INVALID_INSTRUCTION",
    );
  }
  if (
    typeof body.instruction === "string" &&
    body.instruction.length > config.maxInstructionCharacters
  ) {
    throw httpError(
      400,
      `instruction exceeds ${config.maxInstructionCharacters} characters.`,
      "INSTRUCTION_TOO_LONG",
    );
  }
  if (body.shortcutName !== undefined && typeof body.shortcutName !== "string") {
    throw httpError(400, "shortcutName must be a string when provided.", "INVALID_SHORTCUT_NAME");
  }
  if (
    typeof body.shortcutName === "string" &&
    body.shortcutName.length > config.maxShortcutNameCharacters
  ) {
    throw httpError(
      400,
      `shortcutName exceeds ${config.maxShortcutNameCharacters} characters.`,
      "SHORTCUT_NAME_TOO_LONG",
    );
  }
}

function analysisAdmissionWeight(config, request) {
  requireSingleRequestHeader(request, "content-length");
  const header = request.headers["content-length"];
  if (header == null) return config.maxRequestBytes;
  if (!/^(?:0|[1-9]\d*)$/.test(String(header))) {
    throw httpError(400, "Content-Length is invalid.", "INVALID_CONTENT_LENGTH");
  }
  const contentLength = Number(header);
  if (!Number.isSafeInteger(contentLength) || contentLength > config.maxRequestBytes) {
    throw requestTooLarge(config);
  }
  return Math.max(1, contentLength);
}

function validatePairingCreationRequest(body) {
  if (
    !body ||
    Object.keys(body).some((key) => !["extensionId", "nonce"].includes(key)) ||
    !/^[a-p]{32}$/.test(String(body.extensionId || "")) ||
    !/^[A-Za-z0-9_-]{32,160}$/.test(String(body.nonce || ""))
  ) {
    throw httpError(
      400,
      "The extension connection request is invalid.",
      "PAIRING_REQUEST_INVALID",
    );
  }
}

function validatePairingExchangeRequest(body) {
  if (
    !body ||
    Object.keys(body).some((key) => !["pairingCode", "nonce"].includes(key)) ||
    !/^ssp_[A-Za-z0-9_-]{43}$/.test(String(body.pairingCode || "")) ||
    !/^[A-Za-z0-9_-]{32,160}$/.test(String(body.nonce || ""))
  ) {
    throw httpError(
      400,
      "The extension connection exchange is invalid.",
      "PAIRING_EXCHANGE_INVALID",
    );
  }
}

function validateRefreshRequest(body) {
  if (
    !body ||
    Object.keys(body).some((key) => key !== "refreshToken") ||
    typeof body.refreshToken !== "string" ||
    body.refreshToken.length < 80 ||
    body.refreshToken.length > 4096
  ) {
    throw httpError(
      400,
      "The extension refresh request is invalid.",
      "DEVICE_REFRESH_REQUEST_INVALID",
    );
  }
}

function requireEmptyObject(body, label) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(
      400,
      `${label} must be an empty object.`,
      "EMPTY_REQUEST_REQUIRED",
    );
  }
  if (Object.keys(body).length !== 0) {
    throw httpError(
      400,
      `${label} must be empty.`,
      "EMPTY_REQUEST_REQUIRED",
    );
  }
}

function validateCheckoutRequest(body) {
  const allowedKeys = new Set(["plan", "email", "name"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw httpError(
      400,
      "Checkout request contains unsupported fields.",
      "BILLING_CHECKOUT_REQUEST_INVALID",
    );
  }
  if (!["plus", "ultra"].includes(body.plan)) {
    throw httpError(400, "Unknown paid plan.", "BILLING_PLAN_INVALID");
  }
  if (
    body.email !== undefined &&
    (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(body.email)
    )
  ) {
    throw httpError(
      400,
      "Checkout email is invalid.",
      "BILLING_EMAIL_INVALID",
    );
  }
  if (
    body.name !== undefined &&
    (typeof body.name !== "string" || body.name.trim().length > 100)
  ) {
    throw httpError(
      400,
      "Checkout name is invalid.",
      "BILLING_NAME_INVALID",
    );
  }
}

function validateBillingPlanRequest(body, action) {
  if (
    Object.keys(body).length !== 1 ||
    !["plus", "ultra"].includes(body.plan)
  ) {
    throw httpError(
      400,
      `Billing ${action} requires exactly one valid paid plan.`,
      "BILLING_PLAN_REQUEST_INVALID",
    );
  }
}

function requireSingleRequestHeader(request, name) {
  const distinct = request.headersDistinct?.[name];
  const fallback = request.headers?.[name];
  const values = Array.isArray(distinct)
    ? distinct
    : Array.isArray(fallback)
      ? fallback
      : fallback == null
        ? []
        : [fallback];
  if (values.length <= 1) return;
  throw httpError(
    400,
    `Multiple ${name} headers are not allowed.`,
    "AMBIGUOUS_SECURITY_HEADER",
  );
}

function isValidImageDataUrl(value) {
  if (typeof value !== "string") return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\r\n]+)$/i.exec(
    value,
  );
  if (!match) return false;

  const encoded = match[2].replace(/\r?\n/g, "");
  if (
    encoded.length < 4 ||
    encoded.length % 4 !== 0 ||
    !/^[a-z0-9+/]*={0,2}$/i.test(encoded)
  ) {
    return false;
  }

  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const finalValue = base64Value(encoded[encoded.length - padding - 1]);
  if (
    finalValue < 0 ||
    (padding === 2 && (finalValue & 0b1111) !== 0) ||
    (padding === 1 && (finalValue & 0b11) !== 0)
  ) {
    return false;
  }
  const decodedLength = (encoded.length / 4) * 3 - padding;
  if (decodedLength < 1) return false;
  const head = Buffer.from(encoded.slice(0, Math.min(32, encoded.length)), "base64");
  const tail = Buffer.from(encoded.slice(Math.max(0, encoded.length - 8)), "base64");

  switch (match[1].toLowerCase()) {
    case "jpeg":
      return (
        decodedLength >= 4 &&
        head[0] === 0xff &&
        head[1] === 0xd8 &&
        head[2] === 0xff &&
        tail[tail.length - 2] === 0xff &&
        tail[tail.length - 1] === 0xd9
      );
    case "png":
      return (
        decodedLength >= 24 &&
        head.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ) &&
        head.subarray(12, 16).toString("ascii") === "IHDR" &&
        head.readUInt32BE(16) > 0 &&
        head.readUInt32BE(20) > 0
      );
    case "webp":
      return (
        decodedLength >= 16 &&
        head.subarray(0, 4).toString("ascii") === "RIFF" &&
        head.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}

function base64Value(character) {
  const code = String(character || "").charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

function clearSensitiveBody(body) {
  if (!body || typeof body !== "object") return;
  body.imageDataUrl = "";
  body.instruction = "";
  body.shortcutName = "";
  body.sourceUrl = "";
  body.sourceTitle = "";
}

function publicErrorMessage(error, pathname = "") {
  const status = normalizeHttpStatus(error?.status);
  if (status >= 500) {
    if (String(pathname).startsWith("/api/privacy/")) {
      return "The privacy service is temporarily unavailable.";
    }
    return "The analysis service is temporarily unavailable.";
  }
  return error?.message || "Internal server error.";
}

function publicQuota(error) {
  const quota = error?.quota;
  if (!quota || error?.code !== "QUOTA_EXHAUSTED") return null;
  const resetsAt = new Date(quota.resetsAt);
  if (!Number.isFinite(resetsAt.getTime())) return null;
  return {
    plan: ["free", "plus", "ultra"].includes(quota.planId)
      ? quota.planId
      : "free",
    allowance: Math.max(0, Number(quota.allowance) || 0),
    used: Math.max(0, Number(quota.used) || 0),
    reserved: Math.max(0, Number(quota.reserved) || 0),
    resetsAt: resetsAt.toISOString(),
  };
}

function normalizeHttpStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : 500;
}

function publicErrorCode(error) {
  const code = String(error?.code || "");
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "INTERNAL_ERROR";
}

function safeDeletionBacklog(value) {
  const total = Number(value?.total);
  const due = Number(value?.due);
  const overdue = Number(value?.overdue);
  const repeatedlyPartial = Number(value?.repeatedlyPartial);
  const oldestAgeSeconds = Number(value?.oldestAgeSeconds);
  const oldestCreatedAt = value?.oldestCreatedAt == null
    ? null
    : new Date(String(value.oldestCreatedAt));
  if (
    !Number.isSafeInteger(total) || total < 0 ||
    !Number.isSafeInteger(due) || due < 0 || due > total ||
    !Number.isSafeInteger(overdue) || overdue < 0 || overdue > total ||
    !Number.isSafeInteger(repeatedlyPartial) ||
    repeatedlyPartial < 0 || repeatedlyPartial > total ||
    !Number.isSafeInteger(oldestAgeSeconds) || oldestAgeSeconds < 0 ||
    (oldestCreatedAt && !Number.isFinite(oldestCreatedAt.getTime()))
  ) {
    return null;
  }
  return {
    total,
    due,
    overdue,
    repeatedlyPartial,
    oldestCreatedAt: oldestCreatedAt?.toISOString() || null,
    oldestAgeSeconds,
  };
}

function safeZdrSafety(value) {
  const state = String(value?.state || "");
  const consecutiveFailures = Number(value?.consecutiveFailures);
  if (
    !new Set(["enabled", "disabled"]).has(state) ||
    !Number.isSafeInteger(consecutiveFailures) ||
    consecutiveFailures < 0
  ) {
    return null;
  }
  return {
    state,
    consecutiveFailures,
    ...(value?.disabledAt ? { disabledAt: String(value.disabledAt) } : {}),
  };
}

function publicPrivacyMaintenance(privacyService, state) {
  if (!privacyService?.maintenance) return { status: "disabled" };
  const degraded = state.consecutiveFailures > 0 ||
    state.zdrSafety?.state === "disabled" ||
    Number(state.deletionBacklog?.overdue || 0) > 0 ||
    Number(state.deletionBacklog?.repeatedlyPartial || 0) > 0;
  return {
    status: degraded
      ? "degraded"
      : state.lastSuccessAt
        ? "healthy"
        : "pending",
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    consecutiveFailures: state.consecutiveFailures,
    deletionBacklog: state.deletionBacklog,
    zdrSafety: state.zdrSafety,
  };
}

function publicReverification(error) {
  if (publicErrorCode(error) !== "AUTH_REVERIFICATION_REQUIRED") return null;
  const level = String(error?.reverification?.level || "");
  const afterMinutes = Number(error?.reverification?.afterMinutes);
  if (
    level !== "first_factor" ||
    !Number.isInteger(afterMinutes) ||
    afterMinutes < 1 ||
    afterMinutes > 60
  ) {
    return null;
  }
  return { level, afterMinutes };
}

export function publicMaintenanceDiagnostics(error) {
  const result = {};
  const databaseCode = String(error?.databaseCode || "");
  if (/^[A-Z0-9]{5}$/.test(databaseCode)) {
    result.databaseCode = databaseCode;
  }
  if (
    Number.isInteger(error?.providerStatus) &&
    error.providerStatus >= 400 &&
    error.providerStatus <= 599
  ) {
    result.providerStatus = error.providerStatus;
  }
  const diagnostics = Array.isArray(error?.diagnostics)
    ? error.diagnostics.slice(0, 10).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const stage = String(entry.stage || "");
        const code = String(entry.code || "");
        if (
          !/^[a-z][a-z0-9_]{0,31}$/.test(stage) ||
          !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)
        ) {
          return [];
        }
        return [{
          stage,
          code,
          ...(
            /^[A-Z0-9]{5}$/.test(String(entry.databaseCode || ""))
              ? { databaseCode: String(entry.databaseCode) }
              : {}
          ),
          ...(
            Number.isInteger(entry.providerStatus) &&
            entry.providerStatus >= 400 &&
            entry.providerStatus <= 599
              ? { providerStatus: entry.providerStatus }
              : {}
          ),
          ...(
            /^[a-z][a-z0-9_]{0,63}$/.test(String(entry.providerType || ""))
              ? { providerType: entry.providerType }
              : {}
          ),
        }];
      })
    : [];
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}

async function startServer() {
  const config = createConfig();
  validateRuntimeConfig(config);
  const server = createZenaianServer({ config });
  await server.billingService.initialize();
  await server.deviceSessionService?.initialize();
  await server.privacyService?.initialize();
  await server.initializeReadiness();
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "server_shutdown",
      signal,
    }));
    void server.shutdown({ timeoutMs: config.shutdownTimeoutMs }).then(
      () => process.exit(0),
      (error) => {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "server_shutdown_failed",
          code: publicErrorCode(error),
        }));
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`Zenaian server is listening on port ${config.port}`);
    console.log(`Model: ${config.mockMode ? "mock-xai" : config.model}`);
    console.log("Clerk authentication and active-session checks: required");
    console.log(`Allowed origins configured: ${config.allowedOrigins.size}`);
    console.log(
      `Per-user rate limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs} ms`,
    );
    console.log(
      `Analysis capacity: ${config.maxConcurrentRequestsGlobal} concurrent; ` +
      `${Math.round(config.maxActiveAnalysisBytes / 1024 / 1024)} MB in-flight; ` +
      `control-plane capacity: ${config.controlPlaneMaxConcurrentRequests} concurrent`,
    );
    console.log(
      `Adaptive analysis capacity: ${config.adaptiveConcurrencyEnabled ? "enabled" : "disabled"}; ` +
      `floor: ${config.adaptiveMinConcurrent}; ` +
      `RSS threshold: ${Math.round(config.adaptiveRssLimitBytes / 1024 / 1024)} MB; ` +
      `event-loop p99 threshold: ${config.adaptiveEventLoopP99Ms} ms; ` +
      `database wait threshold: ${config.adaptiveDatabaseWaitingThreshold}; ` +
      `sample interval: ${config.adaptiveSampleIntervalMs} ms`,
    );
    console.log(
      `Database-coordinated admission: ${config.maxDistributedConcurrentAnalyses} concurrent; ` +
      `${config.maxDistributedAnalysisStartsPerMinute} starts/minute`,
    );
    console.log(`Graceful shutdown budget: ${config.shutdownTimeoutMs} ms`);
    console.log(`Shared main database pool: ${config.databasePoolMax} connections`);
    console.log(
      `Content-free performance logs: ${config.performanceLogsEnabled ? "enabled" : "disabled"}`,
    );
    console.log(`Billing mode: ${config.billingMode}`);
    console.log(
      config.billingMode === "off"
        ? "Persistent request storage: disabled"
        : "Persistent storage: billing metadata only; screenshots and prompts are not stored",
    );
    // Retention cleanup and deletion retries are important, but an auxiliary
    // maintenance failure must not take the authenticated API offline. The
    // safe diagnostics identify only the failed stage and provider/database
    // code; the existing five-minute scheduler will retry automatically.
    void server.runPrivacyMaintenance?.().catch((error) => {
      logPrivacyMaintenanceError(error);
    });
  });
}

function logPrivacyMaintenanceError(error) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      code: publicErrorCode(error),
      operation: "privacy_maintenance",
      ...publicMaintenanceDiagnostics(error),
    }),
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
