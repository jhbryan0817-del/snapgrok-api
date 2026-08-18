import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeletionLedgerStore } from "../src/deletion-ledger-store.js";
import { loadEnv } from "../src/env.js";
import { createPostgresPrivacyStore } from "../src/privacy-store.js";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
loadEnv(path.join(projectDirectory, ".env"));

const afterValue = process.argv.find((value) => value.startsWith("--after="))
  ?.slice("--after=".length);
const after = new Date(String(afterValue || ""));
if (!Number.isFinite(after.getTime())) {
  throw new Error(
    "Usage: node scripts/replay-deletions-after-restore.js --after=<restore ISO timestamp> [--dry-run]",
  );
}
const dryRun = process.argv.includes("--dry-run");
const pageSize = numberArgument("--page-size", 500, 1, 5000);
const previousKeys = parseVersionedKeys(
  process.env.PRIVACY_DELETION_LEDGER_PREVIOUS_ENCRYPTION_KEYS,
);
const ledger = createDeletionLedgerStore({
  connectionString: process.env.PRIVACY_DELETION_LEDGER_DATABASE_URL,
  encryptionKey: process.env.PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY,
  encryptionKeyVersion: Number(
    process.env.PRIVACY_DELETION_LEDGER_ENCRYPTION_KEY_VERSION || 1,
  ),
  previousEncryptionKeys: previousKeys,
});
const store = createPostgresPrivacyStore({
  connectionString: process.env.DATABASE_URL,
  providerMode: String(process.env.BILLING_MODE || ""),
  hmacKey: process.env.PRIVACY_ARCHIVE_HMAC_KEY,
  hmacKeyVersion: Number(process.env.PRIVACY_ARCHIVE_HMAC_KEY_VERSION || 1),
  previousHmacKeys: parseVersionedKeys(
    process.env.PRIVACY_ARCHIVE_PREVIOUS_HMAC_KEYS,
  ),
});

try {
  await ledger.initialize();
  await store.initialize();
  let deletionCursor = null;
  let deletionPages = 0;
  let deletionCount = 0;
  const receiptSample = [];
  let lastReceipt = null;
  do {
    const page = await ledger.listCompletedPage({
      after,
      cursor: deletionCursor,
      limit: pageSize,
    });
    deletionPages += 1;
    for (const deletion of page.entries) {
      deletionCount += 1;
      lastReceipt = deletion.requestId;
      if (receiptSample.length < 100) receiptSample.push(deletion.requestId);
      if (!dryRun) {
        await store.recordDeletionReplayBlock(deletion);
        await store.deleteDeviceRows(deletion.userId);
        await store.deleteOperationalRows(deletion.userId);
        await store.finishDeletionReplay(deletion.userId);
      }
    }
    deletionCursor = page.nextCursor;
  } while (deletionCursor);

  let retentionCursor = null;
  let retentionMarkerPages = 0;
  let retentionMarkerCount = 0;
  let latestPurgeCutoff = null;
  do {
    const page = await ledger.listRetentionPurgePage({
      after,
      cursor: retentionCursor,
      limit: pageSize,
    });
    retentionMarkerPages += 1;
    for (const marker of page.entries) {
      retentionMarkerCount += 1;
      if (
        !latestPurgeCutoff ||
        marker.purgeCutoffAt.getTime() > latestPurgeCutoff.getTime()
      ) {
        latestPurgeCutoff = marker.purgeCutoffAt;
      }
    }
    retentionCursor = page.nextCursor;
  } while (retentionCursor);

  const retentionPurged = !dryRun && latestPurgeCutoff
    ? await replayRetentionPurge(store, latestPurgeCutoff, pageSize)
    : null;
  console.log(JSON.stringify({
    dryRun,
    restorePoint: after.toISOString(),
    deletionPages,
    deletionReceiptsFound: deletionCount,
    deletionsReplayed: dryRun ? 0 : deletionCount,
    deletionsPendingReplay: dryRun ? deletionCount : 0,
    receiptSample,
    receiptsTruncated: deletionCount > receiptSample.length,
    lastReceipt,
    retentionMarkerPages,
    retentionMarkersFound: retentionMarkerCount,
    latestRetentionPurgeCutoff: latestPurgeCutoff?.toISOString() || null,
    retentionPurged,
  }, null, 2));
} finally {
  await Promise.allSettled([ledger.close(), store.close()]);
}

async function replayRetentionPurge(store, cutoff, limit) {
  const totals = {};
  for (let batch = 0; batch < 100_000; batch += 1) {
    const counts = await store.purgeRetention(cutoff, limit);
    for (const [name, count] of Object.entries(counts)) {
      totals[name] = (totals[name] || 0) + Number(count || 0);
    }
    if (Math.max(0, ...Object.values(counts).map(Number)) < limit) {
      return totals;
    }
  }
  throw new Error("Retention replay exceeded the safe batch limit.");
}

function numberArgument(name, fallback, minimum, maximum) {
  const raw = process.argv.find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function parseVersionedKeys(value) {
  return String(value || "").split(",").map((item) => item.trim())
    .filter(Boolean).map((item) => {
      const [version, key] = item.split(":", 2);
      if (!/^\d+$/.test(version || "") || !key) {
        throw new Error("Previous key entries must use version:base64url.");
      }
      return { version: Number(version), key };
    });
}
