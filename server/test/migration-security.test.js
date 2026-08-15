import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the long-running API never receives or invokes the migration credential", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  const server = await readFile(
    new URL("../src/server.js", import.meta.url),
    "utf8",
  );

  assert.equal(packageJson.scripts.start, "node src/server.js");
  assert.equal(packageJson.scripts["start:render"], "npm start");
  assert.doesNotMatch(packageJson.scripts.start, /migrat/i);
  assert.doesNotMatch(server, /MIGRATION_DATABASE_URL/);
});

test("production migration fails closed unless DDL and runtime roles are isolated", async () => {
  const migrator = await readFile(
    new URL("../scripts/migrate.js", import.meta.url),
    "utf8",
  );

  assert.match(migrator, /SELECT current_user AS current_user, session_user AS session_user/);
  assert.match(migrator, /MIGRATION_DATABASE_URL must connect directly/);
  assert.match(migrator, /pg_has_role\(\$1, \$2, 'MEMBER'\)/);
  assert.match(migrator, /DATABASE_RUNTIME_ROLE must not own or inherit ownership/);
  assert.match(migrator, /REVOKE CREATE, TEMPORARY ON DATABASE/);
  assert.match(migrator, /REVOKE CREATE ON SCHEMA public, legal_retention/);
  assert.match(migrator, /REVOKE ALL ON TABLE public\.schema_migrations/);
  assert.match(migrator, /assertNoForeignModeActiveMemberships/);
});

test("privacy migration functions are syntactically terminated and conflict-safe", async () => {
  const migration = await readFile(
    new URL("../migrations/006_privacy_compliance.sql", import.meta.url),
    "utf8",
  );

  for (const delimiter of [
    "$privacy_block_trigger$",
    "$privacy_membership_archive$",
    "$privacy_payment_archive$",
    "$privacy_payment_mark$",
    "$privacy_legacy_guard$",
  ]) {
    const escapedDelimiter = delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      migration,
      new RegExp(`END;\\s*${escapedDelimiter};`),
      `${delimiter} must terminate its PL/pgSQL body with END;`,
    );
  }
  assert.equal(
    migration.match(/MESSAGE = 'PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT'/g)?.length,
    2,
  );
});
