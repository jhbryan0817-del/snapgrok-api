import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectPrivacyRuntimeReadiness,
  REQUIRED_TABLE_COLUMNS,
} from "../src/privacy-readiness.js";

const UUIDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

test("privacy readiness validates schema, runtime DML, and rolled-back writes", async () => {
  const queries = [];
  const client = readinessClient((sql) => {
    queries.push(sql);
    if (sql.includes("to_regclass(object_name)")) {
      return {
        rows: Object.keys(REQUIRED_TABLE_COLUMNS).map((object_name) => ({
          object_name,
          present: true,
        })),
      };
    }
    if (sql.includes("jsonb_to_recordset")) return { rows: [] };
    if (sql.includes("has_table_privilege")) {
      return {
        rows: Object.keys(REQUIRED_TABLE_COLUMNS).map((object_name) => ({
          object_name,
          can_select: true,
          can_insert: true,
          can_update: true,
          can_delete: true,
        })),
      };
    }
    if (sql.includes("has_schema_privilege")) {
      return { rows: [{ public_usage: true, archive_usage: true }] };
    }
    return { rows: [], rowCount: 1 };
  });
  let nextUuid = 0;

  assert.deepEqual(
    await inspectPrivacyRuntimeReadiness(client, {
      randomUUIDFn: () => UUIDS[nextUuid++],
    }),
    { ready: true, code: null, databaseCode: null },
  );
  assert.equal(queries.includes("BEGIN"), true);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(
    queries.some((sql) => sql.startsWith("INSERT INTO privacy_request_audit")),
    true,
  );
  assert.equal(
    queries.some((sql) =>
      sql.startsWith("INSERT INTO legal_retention.transaction_records")),
    true,
  );
});

test("privacy readiness reports exact missing columns before accepting startup", async () => {
  const client = readinessClient((sql) => {
    if (sql.includes("to_regclass(object_name)")) {
      return {
        rows: Object.keys(REQUIRED_TABLE_COLUMNS).map((object_name) => ({
          object_name,
          present: true,
        })),
      };
    }
    if (sql.includes("jsonb_to_recordset")) {
      return {
        rows: [{
          table_name: "public.billing_payment_history",
          column_name: "archived_at",
        }],
      };
    }
    throw new Error("readiness should stop after finding a schema mismatch");
  });

  assert.deepEqual(await inspectPrivacyRuntimeReadiness(client), {
    ready: false,
    code: "PRIVACY_DATABASE_SCHEMA_MISMATCH",
    databaseCode: null,
    missingColumns: ["public.billing_payment_history.archived_at"],
  });
});

test("privacy readiness rolls back and retains only safe SQLSTATE diagnostics", async () => {
  const queries = [];
  const client = readinessClient((sql) => {
    queries.push(sql);
    if (sql.includes("to_regclass(object_name)")) {
      return {
        rows: Object.keys(REQUIRED_TABLE_COLUMNS).map((object_name) => ({
          object_name,
          present: true,
        })),
      };
    }
    if (sql.includes("jsonb_to_recordset")) return { rows: [] };
    if (sql.includes("has_table_privilege")) {
      return {
        rows: Object.keys(REQUIRED_TABLE_COLUMNS).map((object_name) => ({
          object_name,
          can_select: true,
          can_insert: true,
          can_update: true,
          can_delete: true,
        })),
      };
    }
    if (sql.includes("has_schema_privilege")) {
      return { rows: [{ public_usage: true, archive_usage: true }] };
    }
    if (sql.startsWith("INSERT INTO privacy_request_audit")) {
      throw Object.assign(new Error("sensitive database message"), {
        code: "42501",
      });
    }
    return { rows: [], rowCount: 1 };
  });
  let nextUuid = 0;

  assert.deepEqual(
    await inspectPrivacyRuntimeReadiness(client, {
      randomUUIDFn: () => UUIDS[nextUuid++],
    }),
    {
      ready: false,
      code: "PRIVACY_DATABASE_WRITE_PROBE_FAILED",
      databaseCode: "42501",
    },
  );
  assert.equal(queries.at(-1), "ROLLBACK");
});

function readinessClient(handler) {
  return {
    async query(sql, parameters) {
      return handler(normalizeSql(sql), parameters);
    },
  };
}

function normalizeSql(value) {
  return String(value).trim().replace(/\s+/g, " ");
}
