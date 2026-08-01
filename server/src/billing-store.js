import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

export function createPostgresBillingStore({
  connectionString,
  pool,
  poolMax = 10,
  connectionTimeoutMs = 5000,
  statementTimeoutMs = 10000,
}) {
  if (!pool && !connectionString) {
    throw new Error("DATABASE_URL is required when billing is enabled.");
  }

  const database = pool || new Pool({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
    application_name: "sneaksolve-api",
  });
  const ownsPool = !pool;

  return {
    async initialize() {
      const result = await database.query(
        "SELECT to_regclass('billing_subscriptions') AS subscriptions_table",
      );
      if (!result.rows[0]?.subscriptions_table) {
        throw billingDatabaseError(
          "Billing database migrations have not been applied.",
          "BILLING_DATABASE_NOT_MIGRATED",
        );
      }
    },

    async close() {
      if (ownsPool) await database.end();
    },

    async listSubscriptions(userId) {
      const result = await database.query(
        `SELECT
           lemon_subscription_id,
           clerk_user_id,
           variant_id,
           status,
           renews_at,
           ends_at,
           trial_ends_at,
           period_started_at,
           lemon_updated_at
         FROM billing_subscriptions
         WHERE clerk_user_id = $1
         ORDER BY lemon_updated_at DESC`,
        [userId],
      );
      return result.rows.map(mapSubscription);
    },

    async listMappedSubscriptionIds() {
      const result = await database.query(
        `SELECT lemon_subscription_id
         FROM billing_subscriptions
         ORDER BY lemon_subscription_id`,
      );
      return result.rows.map((row) => String(row.lemon_subscription_id));
    },

    async syncMappedSubscription(normalizedSubscription) {
      const result = await database.query(
        `UPDATE billing_subscriptions
         SET variant_id = $2,
             status = $3,
             renews_at = $4,
             ends_at = $5,
             trial_ends_at = $6,
             lemon_updated_at = GREATEST(lemon_updated_at, $7),
             last_event_name = 'reconciliation',
             updated_at = now()
         WHERE lemon_subscription_id = $1`,
        [
          normalizedSubscription.id,
          normalizedSubscription.variantId,
          normalizedSubscription.status,
          normalizedSubscription.renewsAt,
          normalizedSubscription.endsAt,
          normalizedSubscription.trialEndsAt,
          normalizedSubscription.updatedAt,
        ],
      );
      return result.rowCount === 1;
    },

    async getUsagePeriod(userId, periodKey) {
      const result = await database.query(
        `SELECT id, plan_id, allowance, consumed, reserved, starts_at, ends_at
         FROM billing_usage_periods
         WHERE clerk_user_id = $1 AND period_key = $2`,
        [userId, periodKey],
      );
      return result.rows[0] ? mapUsagePeriod(result.rows[0]) : null;
    },

    async reserveUsage({
      userId,
      operationId,
      planId,
      model,
      period,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT operation_id, clerk_user_id, state
           FROM billing_analysis_usage
           WHERE operation_id = $1
           FOR UPDATE`,
          [operationId],
        );
        if (existing.rows[0]) {
          throw existingOperationError(existing.rows[0], userId);
        }

        const periodId = randomUUID();
        const periodResult = await client.query(
          `INSERT INTO billing_usage_periods (
             id, clerk_user_id, period_key, plan_id, allowance,
             starts_at, ends_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (clerk_user_id, period_key)
           DO UPDATE SET
             plan_id = EXCLUDED.plan_id,
             allowance = GREATEST(
               EXCLUDED.allowance,
               billing_usage_periods.consumed + billing_usage_periods.reserved
             ),
             starts_at = LEAST(billing_usage_periods.starts_at, EXCLUDED.starts_at),
             ends_at = GREATEST(billing_usage_periods.ends_at, EXCLUDED.ends_at),
             updated_at = now()
           RETURNING id, plan_id, allowance, consumed, reserved, starts_at, ends_at`,
          [
            periodId,
            userId,
            period.key,
            planId,
            period.allowance,
            period.startsAt,
            period.endsAt,
          ],
        );
        const usage = mapUsagePeriod(periodResult.rows[0]);
        const usedOrReserved = usage.consumed + usage.reserved;
        if (usedOrReserved >= period.allowance) {
          throw quotaExceeded({
            planId,
            allowance: period.allowance,
            used: usage.consumed,
            reserved: usage.reserved,
            resetsAt: usage.endsAt,
          });
        }

        await client.query(
          `INSERT INTO billing_analysis_usage (
             operation_id, clerk_user_id, usage_period_id, plan_id, model_id, state
           )
           VALUES ($1, $2, $3, $4, $5, 'reserved')`,
          [operationId, userId, usage.id, planId, model],
        );
        await client.query(
          `UPDATE billing_usage_periods
           SET reserved = reserved + 1, updated_at = now()
           WHERE id = $1`,
          [usage.id],
        );
        await client.query("COMMIT");

        return {
          operationId,
          periodId: usage.id,
          planId,
          model,
          allowance: period.allowance,
          remaining: Math.max(0, period.allowance - usedOrReserved - 1),
          resetsAt: usage.endsAt,
        };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
      }
    },

    async consumeUsage(operationId, userId) {
      return settleUsage(database, {
        operationId,
        userId,
        targetState: "consumed",
      });
    },

    async releaseUsage(operationId, userId) {
      return settleUsage(database, {
        operationId,
        userId,
        targetState: "released",
      });
    },

    async releaseStaleReservations(olderThan) {
      const result = await database.query(
        `WITH stale AS (
           UPDATE billing_analysis_usage
           SET state = 'released', settled_at = now()
           WHERE state = 'reserved' AND created_at < $1
           RETURNING usage_period_id
         ),
         released AS (
           SELECT usage_period_id, count(*)::integer AS count
           FROM stale
           GROUP BY usage_period_id
         )
         UPDATE billing_usage_periods AS periods
         SET reserved = GREATEST(0, periods.reserved - released.count),
             updated_at = now()
         FROM released
         WHERE periods.id = released.usage_period_id
         RETURNING periods.id`,
        [olderThan],
      );
      return result.rowCount;
    },

    async createCheckoutIntent({
      id,
      userId,
      planId,
      variantId,
      expiresAt,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);

        const subscriptions = await client.query(
          `SELECT lemon_subscription_id
           FROM billing_subscriptions
           WHERE clerk_user_id = $1
             AND status <> 'expired'
             AND (status <> 'cancelled' OR ends_at > now())
           LIMIT 1`,
          [userId],
        );
        if (subscriptions.rows[0]) {
          throw billingConflict(
            "A paid subscription is already active.",
            "SUBSCRIPTION_ALREADY_ACTIVE",
          );
        }

        await client.query(
          `UPDATE billing_checkout_intents
           SET status = 'expired', updated_at = now()
           WHERE clerk_user_id = $1
             AND status IN ('pending', 'checkout_created')
             AND expires_at <= now()`,
          [userId],
        );

        const pending = await client.query(
          `SELECT id, requested_plan, status, checkout_url
           FROM billing_checkout_intents
           WHERE clerk_user_id = $1
             AND status IN ('pending', 'checkout_created')
             AND expires_at > now()
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId],
        );
        if (pending.rows[0]) {
          if (pending.rows[0].requested_plan !== planId) {
            throw billingConflict(
              "Finish or wait for the existing checkout before choosing a different plan.",
              "CHECKOUT_PLAN_CHANGE_PENDING",
            );
          }
          if (
            pending.rows[0].status === "checkout_created" &&
            pending.rows[0].checkout_url
          ) {
            await client.query("COMMIT");
            return {
              id: pending.rows[0].id,
              existingUrl: pending.rows[0].checkout_url,
            };
          }
          throw billingConflict(
            "A checkout is already being created. Try again shortly.",
            "CHECKOUT_ALREADY_PENDING",
          );
        }

        await client.query(
          `INSERT INTO billing_checkout_intents (
             id, clerk_user_id, requested_plan, variant_id, expires_at
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [id, userId, planId, variantId, expiresAt],
        );
        await client.query("COMMIT");
        return { id, existingUrl: null };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
      }
    },

    async markCheckoutCreated(id, checkoutId, checkoutUrl) {
      await database.query(
        `UPDATE billing_checkout_intents
         SET status = 'checkout_created',
             lemon_checkout_id = $2,
             checkout_url = $3,
             updated_at = now()
         WHERE id = $1 AND status = 'pending'`,
        [id, checkoutId, checkoutUrl],
      );
    },

    async markCheckoutFailed(id) {
      await database.query(
        `UPDATE billing_checkout_intents
         SET status = 'failed', checkout_url = NULL, updated_at = now()
         WHERE id = $1 AND status = 'pending'`,
        [id],
      );
    },

    async applySubscriptionWebhook({
      deliveryHash,
      eventName,
      body,
      normalizedSubscription,
      customUserId,
      checkoutIntentId,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const inserted = await insertWebhookEvent(client, {
          deliveryHash,
          eventName,
          body,
          resourceType: "subscriptions",
          resourceId: normalizedSubscription.id,
          resourceUpdatedAt: normalizedSubscription.updatedAt,
        });
        if (!inserted) {
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        const existingResult = await client.query(
          `SELECT clerk_user_id, lemon_updated_at
           FROM billing_subscriptions
           WHERE lemon_subscription_id = $1
           FOR UPDATE`,
          [normalizedSubscription.id],
        );
        const existing = existingResult.rows[0];
        let userId = existing?.clerk_user_id || "";

        if (existing && customUserId && customUserId !== userId) {
          await finishWebhook(client, deliveryHash, "quarantined", "user_mismatch");
          await client.query("COMMIT");
          return { duplicate: false, applied: false, quarantined: true };
        }

        if (!existing) {
          const intentResult = await client.query(
            `SELECT clerk_user_id, variant_id, status, expires_at
             FROM billing_checkout_intents
             WHERE id = $1
             FOR UPDATE`,
            [checkoutIntentId],
          );
          const intent = intentResult.rows[0];
          if (
            !intent ||
            !customUserId ||
            intent.clerk_user_id !== customUserId ||
            String(intent.variant_id) !== String(normalizedSubscription.variantId) ||
            !["pending", "checkout_created"].includes(intent.status)
          ) {
            await finishWebhook(client, deliveryHash, "quarantined", "checkout_intent_invalid");
            await client.query("COMMIT");
            return { duplicate: false, applied: false, quarantined: true };
          }
          userId = intent.clerk_user_id;
        }

        if (
          existing &&
          new Date(existing.lemon_updated_at).getTime() >
            normalizedSubscription.updatedAt.getTime()
        ) {
          await finishWebhook(client, deliveryHash, "ignored", "older_subscription_state");
          await client.query("COMMIT");
          return { duplicate: false, applied: false, stale: true };
        }

        await client.query(
          `INSERT INTO billing_subscriptions (
             lemon_subscription_id, clerk_user_id, lemon_customer_id,
             lemon_order_id, store_id, product_id, variant_id, status,
             test_mode, renews_at, ends_at, trial_ends_at, lemon_created_at,
             lemon_updated_at, period_started_at, last_event_name
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16
           )
           ON CONFLICT (lemon_subscription_id)
           DO UPDATE SET
             variant_id = EXCLUDED.variant_id,
             status = EXCLUDED.status,
             renews_at = EXCLUDED.renews_at,
             ends_at = EXCLUDED.ends_at,
             trial_ends_at = EXCLUDED.trial_ends_at,
             lemon_updated_at = EXCLUDED.lemon_updated_at,
             period_started_at = billing_subscriptions.period_started_at,
             last_event_name = EXCLUDED.last_event_name,
             updated_at = now()
           WHERE billing_subscriptions.lemon_updated_at <= EXCLUDED.lemon_updated_at`,
          [
            normalizedSubscription.id,
            userId,
            normalizedSubscription.customerId,
            normalizedSubscription.orderId,
            normalizedSubscription.storeId,
            normalizedSubscription.productId,
            normalizedSubscription.variantId,
            normalizedSubscription.status,
            normalizedSubscription.testMode,
            normalizedSubscription.renewsAt,
            normalizedSubscription.endsAt,
            normalizedSubscription.trialEndsAt,
            normalizedSubscription.createdAt,
            normalizedSubscription.updatedAt,
            normalizedSubscription.createdAt,
            eventName,
          ],
        );

        if (checkoutIntentId) {
          await client.query(
            `UPDATE billing_checkout_intents
             SET status = 'consumed',
                 consumed_at = COALESCE(consumed_at, now()),
                 checkout_url = NULL,
                 updated_at = now()
             WHERE id = $1 AND clerk_user_id = $2`,
            [checkoutIntentId, userId],
          );
        }
        await finishWebhook(client, deliveryHash, "processed", null);
        await client.query("COMMIT");
        return { duplicate: false, applied: true };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
      }
    },

    async applySubscriptionPaymentWebhook({
      deliveryHash,
      eventName,
      body,
      invoice,
      normalizedSubscription,
      cycleStartedAt,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const inserted = await insertWebhookEvent(client, {
          deliveryHash,
          eventName,
          body,
          resourceType: "subscription-invoices",
          resourceId: invoice.id,
          resourceUpdatedAt: invoice.updatedAt,
        });
        if (!inserted) {
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        const updated = await client.query(
          `UPDATE billing_subscriptions
           SET variant_id = $2,
               status = $3,
               renews_at = $4,
               ends_at = $5,
               trial_ends_at = $6,
               lemon_updated_at = GREATEST(lemon_updated_at, $7),
               period_started_at = CASE
                 WHEN $8::timestamptz IS NULL THEN period_started_at
                 ELSE GREATEST(period_started_at, $8::timestamptz)
               END,
               last_event_name = $9,
               updated_at = now()
           WHERE lemon_subscription_id = $1
           RETURNING clerk_user_id`,
          [
            normalizedSubscription.id,
            normalizedSubscription.variantId,
            normalizedSubscription.status,
            normalizedSubscription.renewsAt,
            normalizedSubscription.endsAt,
            normalizedSubscription.trialEndsAt,
            normalizedSubscription.updatedAt,
            cycleStartedAt,
            eventName,
          ],
        );
        if (!updated.rows[0]) {
          await finishWebhook(
            client,
            deliveryHash,
            "quarantined",
            "subscription_mapping_missing",
          );
          await client.query("COMMIT");
          return { duplicate: false, applied: false, quarantined: true };
        }

        await finishWebhook(client, deliveryHash, "processed", null);
        await client.query("COMMIT");
        return { duplicate: false, applied: true };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
      }
    },

    async recordWebhook({
      deliveryHash,
      eventName,
      body,
      resourceType,
      resourceId,
      resourceUpdatedAt,
      state,
      reason,
    }) {
      const result = await database.query(
        `INSERT INTO billing_webhook_events (
           delivery_hash, event_name, resource_type, resource_id,
           resource_updated_at, processing_state, processing_error,
           body, processed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
         ON CONFLICT (delivery_hash) DO NOTHING`,
        [
          deliveryHash,
          eventName,
          resourceType || null,
          resourceId || null,
          resourceUpdatedAt || null,
          state,
          reason || null,
          JSON.stringify(body),
        ],
      );
      return { duplicate: result.rowCount === 0 };
    },

    async purgeWebhookBodies(before) {
      const result = await database.query(
        `DELETE FROM billing_webhook_events
         WHERE received_at < $1`,
        [before],
      );
      return result.rowCount;
    },
  };
}

async function settleUsage(database, {
  operationId,
  userId,
  targetState,
}) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const usageResult = await client.query(
      `SELECT operation_id, clerk_user_id, usage_period_id, state
       FROM billing_analysis_usage
       WHERE operation_id = $1
       FOR UPDATE`,
      [operationId],
    );
    const usage = usageResult.rows[0];
    if (!usage || usage.clerk_user_id !== userId) {
      throw billingDatabaseError(
        "The analysis reservation was not found.",
        "ANALYSIS_RESERVATION_NOT_FOUND",
      );
    }
    if (usage.state === targetState) {
      await client.query("COMMIT");
      return false;
    }
    if (usage.state !== "reserved") {
      throw billingConflict(
        "The analysis reservation has already been settled.",
        "ANALYSIS_RESERVATION_SETTLED",
      );
    }

    await client.query(
      `UPDATE billing_analysis_usage
       SET state = $2, settled_at = now()
       WHERE operation_id = $1`,
      [operationId, targetState],
    );
    await client.query(
      `UPDATE billing_usage_periods
       SET reserved = GREATEST(0, reserved - 1),
           consumed = consumed + CASE WHEN $2 = 'consumed' THEN 1 ELSE 0 END,
           updated_at = now()
       WHERE id = $1`,
      [usage.usage_period_id, targetState],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await rollbackQuietly(client);
    throw normalizeDatabaseError(error);
  } finally {
    client.release();
  }
}

async function insertWebhookEvent(client, {
  deliveryHash,
  eventName,
  body,
  resourceType,
  resourceId,
  resourceUpdatedAt,
}) {
  const result = await client.query(
    `INSERT INTO billing_webhook_events (
       delivery_hash, event_name, resource_type, resource_id,
       resource_updated_at, processing_state, body
     )
     VALUES ($1, $2, $3, $4, $5, 'received', $6::jsonb)
     ON CONFLICT (delivery_hash) DO NOTHING`,
    [
      deliveryHash,
      eventName,
      resourceType,
      resourceId,
      resourceUpdatedAt,
      JSON.stringify(body),
    ],
  );
  return result.rowCount === 1;
}

async function finishWebhook(client, deliveryHash, state, reason) {
  await client.query(
    `UPDATE billing_webhook_events
     SET processing_state = $2,
         processing_error = $3,
         processed_at = now()
     WHERE delivery_hash = $1`,
    [deliveryHash, state, reason],
  );
}

function mapSubscription(row) {
  return {
    id: String(row.lemon_subscription_id),
    userId: row.clerk_user_id,
    variantId: String(row.variant_id),
    status: row.status,
    renewsAt: row.renews_at,
    endsAt: row.ends_at,
    trialEndsAt: row.trial_ends_at,
    periodStartedAt: row.period_started_at,
    updatedAt: row.lemon_updated_at,
  };
}

function mapUsagePeriod(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    allowance: Number(row.allowance),
    consumed: Number(row.consumed),
    reserved: Number(row.reserved),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

function existingOperationError(operation, userId) {
  if (operation.clerk_user_id !== userId) {
    return billingConflict(
      "The analysis operation ID is already in use.",
      "ANALYSIS_OPERATION_CONFLICT",
    );
  }
  const codes = {
    reserved: "ANALYSIS_ALREADY_IN_PROGRESS",
    consumed: "ANALYSIS_ALREADY_CONSUMED",
    released: "ANALYSIS_OPERATION_RELEASED",
  };
  return billingConflict(
    "This analysis operation has already been handled.",
    codes[operation.state] || "ANALYSIS_OPERATION_CONFLICT",
  );
}

function quotaExceeded(details) {
  const error = new Error(
    details.planId === "free"
      ? "Your five free questions for today have been used."
      : "Your monthly SneakSolve question allowance has been used.",
  );
  error.status = 429;
  error.code = "QUOTA_EXHAUSTED";
  error.quota = details;
  return error;
}

function billingConflict(message, code) {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  return error;
}

function billingDatabaseError(message, code = "BILLING_DATABASE_UNAVAILABLE") {
  const error = new Error(message);
  error.status = 503;
  error.code = code;
  return error;
}

function normalizeDatabaseError(error) {
  if (error?.code && /^[A-Z][A-Z0-9_]+$/.test(error.code)) return error;
  const normalized = billingDatabaseError(
    "The billing database is temporarily unavailable.",
  );
  normalized.databaseCode = /^[A-Z0-9]{5}$/.test(String(error?.code || ""))
    ? error.code
    : undefined;
  return normalized;
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {}
}
