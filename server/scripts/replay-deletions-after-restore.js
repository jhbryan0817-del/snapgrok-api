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
  const deletions = await ledger.listCompletedAfter(after, 5000);
  if (!dryRun) {
    for (const deletion of deletions) {
      await store.recordDeletionReplayBlock(deletion);
      await store.deleteDeviceRows(deletion.userId);
      await store.deleteOperationalRows(deletion.userId);
      await store.finishDeletionReplay(deletion.userId);
    }
  }
  console.log(JSON.stringify({
    dryRun,
    restorePoint: after.toISOString(),
    replayed: dryRun ? 0 : deletions.length,
    pendingReplay: dryRun ? deletions.length : 0,
    receipts: deletions.map((entry) => entry.requestId),
  }, null, 2));
} finally {
  await Promise.allSettled([ledger.close(), store.close()]);
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
