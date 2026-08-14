import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const ACCESS_HOLD_STATES = new Set(["payment_failed", "revoked"]);
const ACCESS_RESTORE_EVENTS = new Set([
  "membership.activated",
  "payment.succeeded",
  "dispute.resolved",
]);

export function createPostgresBillingStore({
  connectionString,
  pool,
  providerMode,
  poolMax = 10,
  connectionTimeoutMs = 5000,
  statementTimeoutMs = 10000,
}) {
  if (!pool && !connectionString) {
    throw new Error("DATABASE_URL is required when billing is enabled.");
  }
  if (!new Set(["test", "live"]).has(providerMode)) {
    throw new Error("Whop billing store mode must be test or live.");
  }

  const database = pool || new Pool({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis: connectionTimeoutMs,
    idleTimeoutMillis: 30000,
    statement_timeout: statementTimeoutMs,
    query_timeout: statementTimeoutMs,
    application_name: "zenaian-api",
  });
  const ownsPool = !pool;

  return {
    async initialize() {
      const result = await database.query(
        `SELECT to_regclass('billing_memberships') AS memberships_table,
                to_regclass('billing_payment_history') AS payment_history_table,
                EXISTS (
                  SELECT 1 FROM information_schema.columns
                  WHERE table_schema = current_schema()
                    AND table_name = 'billing_memberships'
                    AND column_name = 'provider_mode'
                ) AS production_lifecycle_ready`,
      );
      if (
        !result.rows[0]?.memberships_table ||
        !result.rows[0]?.payment_history_table ||
        !result.rows[0]?.production_lifecycle_ready
      ) {
        throw billingDatabaseError(
          "Whop billing database migrations have not been applied.",
          "BILLING_DATABASE_NOT_MIGRATED",
        );
      }
    },

    async close() {
      if (ownsPool) await database.end();
    },

    async listSubscriptions(userId) {
      const result = await database.query(
        `SELECT provider_membership_id, clerk_user_id, product_id, plan_id,
                provider_status, access_state, renewal_period_start,
                renewal_period_end, period_started_at, cancel_at_period_end,
                provider_updated_at
         FROM billing_memberships
         WHERE provider_mode = $1 AND clerk_user_id = $2
         ORDER BY provider_updated_at DESC`,
        [providerMode, userId],
      );
      return result.rows.map(mapSubscription);
    },

    async listMappedMembershipIds() {
      const result = await database.query(
        `SELECT provider_membership_id
         FROM billing_memberships
         WHERE provider_mode = $1
           AND access_state IN (
             'active', 'cancel_at_period_end', 'payment_failed'
           )
         ORDER BY provider_membership_id`,
        [providerMode],
      );
      return result.rows.map((row) => String(row.provider_membership_id));
    },

    async listAdverseRenewalCancellationIds(limit = 100) {
      const boundedLimit = Math.max(
        1,
        Math.min(500, Number.isSafeInteger(limit) ? limit : 100),
      );
      const result = await database.query(
        `SELECT provider_membership_id
         FROM billing_memberships
         WHERE provider_mode = $1
           AND access_state = 'revoked'
           AND cancel_at_period_end = false
           AND provider_status IN ('active', 'canceling')
         ORDER BY state_changed_at ASC, provider_membership_id
         LIMIT $2`,
        [providerMode, boundedLimit],
      );
      return result.rows.map((row) => String(row.provider_membership_id));
    },

    async listPaymentHistory(userId, limit = 50) {
      const boundedLimit = Math.max(
        1,
        Math.min(100, Number.isSafeInteger(limit) ? limit : 50),
      );
      const result = await database.query(
        `SELECT provider_payment_id, plan_code, display_status,
                provider_substatus, paid_at, provider_updated_at
         FROM billing_payment_history
         WHERE provider_mode = $1 AND clerk_user_id = $2
         ORDER BY COALESCE(paid_at, provider_updated_at) DESC,
                  provider_payment_id DESC
         LIMIT $3`,
        [providerMode, userId, boundedLimit],
      );
      return result.rows.map(mapPaymentHistory);
    },

    async listRecoverableCheckoutIntents(limit = 100) {
      const result = await database.query(
        `SELECT id, clerk_user_id, requested_plan, company_id, product_id,
                plan_id, provider_checkout_id, created_at
         FROM billing_checkout_sessions
         WHERE provider_mode = $1 AND status = 'checkout_created'
           AND provider_checkout_id IS NOT NULL
           AND created_at >= now() - interval '7 days'
         ORDER BY created_at ASC
         LIMIT $2`,
        [providerMode, limit],
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        userId: String(row.clerk_user_id),
        planCode: String(row.requested_plan),
        companyId: String(row.company_id),
        productId: String(row.product_id),
        planId: String(row.plan_id),
        checkoutConfigurationId: String(row.provider_checkout_id),
        createdAt: row.created_at,
      }));
    },

    async syncMappedMembership(membership, eventName = "reconciliation") {
      const result = await database.query(
        `UPDATE billing_memberships
         SET provider_status = $3,
             access_state = CASE
               WHEN access_state IN ('payment_failed', 'revoked')
                 AND $4 IN ('active', 'cancel_at_period_end')
               THEN access_state
               ELSE $4
             END,
             renewal_period_start = $5,
             renewal_period_end = $6,
             period_started_at = CASE
               WHEN $5::timestamptz IS NULL THEN period_started_at
               ELSE GREATEST(period_started_at, $5::timestamptz)
             END,
             cancel_at_period_end = $7,
             canceled_at = $8,
             single_plan_guard = CASE
               WHEN $4 IN ('active', 'cancel_at_period_end')
                 AND access_state NOT IN ('active', 'cancel_at_period_end')
               THEN COALESCE(single_plan_guard, clerk_user_id)
               ELSE single_plan_guard
             END,
             provider_updated_at = GREATEST(provider_updated_at, $9),
             state_changed_at = CASE
               WHEN access_state IN ('payment_failed', 'revoked')
                 AND $4 IN ('active', 'cancel_at_period_end')
               THEN state_changed_at
               ELSE GREATEST(state_changed_at, $9)
             END,
             last_event_id = $10,
             last_event_name = $11,
             updated_at = now()
         WHERE provider_mode = $1
           AND provider_membership_id = $2
           AND company_id = $12
           AND product_id = $13
           AND plan_id = $14
           AND provider_updated_at <= $9
           AND (
             $4 NOT IN ('active', 'cancel_at_period_end')
             OR access_state IN ('active', 'cancel_at_period_end')
             OR NOT EXISTS (
               SELECT 1
               FROM billing_memberships AS other
               WHERE other.provider_mode = billing_memberships.provider_mode
                 AND other.clerk_user_id = billing_memberships.clerk_user_id
                 AND other.provider_membership_id <>
                     billing_memberships.provider_membership_id
                 AND other.access_state IN ('active', 'cancel_at_period_end')
             )
           )`,
        [
          providerMode,
          membership.id,
          membership.providerStatus,
          membership.accessState,
          membership.renewalPeriodStart,
          membership.renewalPeriodEnd,
          membership.cancelAtPeriodEnd,
          membership.canceledAt,
          membership.updatedAt,
          `reconcile:${membership.id}:${membership.updatedAt.toISOString()}`,
          eventName,
          membership.companyId,
          membership.productId,
          membership.planId,
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

    async reserveUsage({ userId, operationId, planId, model, period }) {
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
           ) VALUES ($1, $2, $3, $4, $5, 'reserved')`,
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
      return settleUsage(database, { operationId, userId, targetState: "consumed" });
    },

    async releaseUsage(operationId, userId) {
      return settleUsage(database, { operationId, userId, targetState: "released" });
    },

    async releaseStaleReservations(olderThan) {
      const result = await database.query(
        `WITH stale AS (
           UPDATE billing_analysis_usage
           SET state = 'released', settled_at = now()
           WHERE state = 'reserved' AND created_at < $1
           RETURNING usage_period_id
         ), released AS (
           SELECT usage_period_id, count(*)::integer AS count
           FROM stale GROUP BY usage_period_id
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
      planCode,
      companyId,
      productId,
      providerPlanId,
      expiresAt,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);

        // A signed cancel-at-period-end state has an authoritative expiry. If
        // its webhook is delayed, release the database uniqueness guard once
        // that paid period has actually elapsed.
        await client.query(
          `UPDATE billing_memberships
           SET provider_status = 'expired', access_state = 'inactive',
               state_changed_at = now(), last_event_id = $3,
               last_event_name = 'local.period_elapsed', updated_at = now()
           WHERE provider_mode = $1 AND clerk_user_id = $2
             AND access_state = 'cancel_at_period_end'
             AND renewal_period_end <= now()`,
          [providerMode, userId, `period-elapsed:${id}`],
        );

        const memberships = await client.query(
          `SELECT provider_membership_id, plan_code, access_state
           FROM billing_memberships
           WHERE provider_mode = $1 AND clerk_user_id = $2
             AND access_state IN ('active', 'cancel_at_period_end')
           FOR UPDATE`,
          [providerMode, userId],
        );
        if (memberships.rows.length > 0) {
          const currentPlan = String(memberships.rows[0].plan_code || "paid");
          throw billingConflict(
            `This account already has an active ${currentPlan} subscription. Cancel renewal and wait until its paid period expires before purchasing another plan.`,
            "SUBSCRIPTION_ALREADY_ACTIVE",
          );
        }

        await client.query(
          `UPDATE billing_checkout_sessions
           SET status = 'expired', checkout_url = NULL, updated_at = now()
           WHERE provider_mode = $1 AND clerk_user_id = $2
             AND status IN ('pending', 'checkout_created')
             AND expires_at <= now()`,
          [providerMode, userId],
        );
        const pending = await client.query(
          `SELECT id, requested_plan, status, checkout_url
           FROM billing_checkout_sessions
           WHERE provider_mode = $1 AND clerk_user_id = $2
             AND status IN ('pending', 'checkout_created')
             AND expires_at > now()
           ORDER BY created_at DESC
           LIMIT 1`,
          [providerMode, userId],
        );
        if (pending.rows[0]) {
          if (pending.rows[0].requested_plan !== planCode) {
            throw billingConflict(
              "Finish or wait for the existing checkout before choosing a different plan.",
              "CHECKOUT_PLAN_CHANGE_PENDING",
            );
          }
          if (pending.rows[0].status === "checkout_created" && pending.rows[0].checkout_url) {
            await client.query("COMMIT");
            return { id: pending.rows[0].id, existingUrl: pending.rows[0].checkout_url };
          }
          throw billingConflict(
            "A checkout is already being created. Try again shortly.",
            "CHECKOUT_ALREADY_PENDING",
          );
        }

        await client.query(
          `INSERT INTO billing_checkout_sessions (
             id, provider_mode, clerk_user_id, requested_plan, company_id,
             product_id, plan_id, expires_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            providerMode,
            userId,
            planCode,
            companyId,
            productId,
            providerPlanId,
            expiresAt,
          ],
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
      const result = await database.query(
        `UPDATE billing_checkout_sessions
         SET status = 'checkout_created', provider_checkout_id = $3,
             checkout_url = $4, updated_at = now()
         WHERE id = $1 AND provider_mode = $2 AND status = 'pending'`,
        [id, providerMode, checkoutId, checkoutUrl],
      );
      if (result.rowCount !== 1) {
        throw billingConflict("The checkout intent is no longer active.", "CHECKOUT_EXPIRED");
      }
    },

    async markCheckoutFailed(id) {
      await database.query(
        `UPDATE billing_checkout_sessions
         SET status = 'failed', checkout_url = NULL, updated_at = now()
         WHERE id = $1 AND provider_mode = $2 AND status = 'pending'`,
        [id, providerMode],
      );
    },

    async applyMembershipWebhook({
      deliveryId,
      eventName,
      eventTimestamp,
      payloadDigest,
      sanitizedPayload,
      membership,
      customUserId,
      checkoutIntentId,
      cycleStartedAt = null,
      allowAccessRestore = false,
      payment = null,
    }) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const inserted = await insertProviderEvent(client, {
          providerMode,
          deliveryId,
          eventName,
          eventTimestamp,
          payloadDigest,
          sanitizedPayload,
          companyId: membership.companyId,
          resourceType: String(eventName).split(".", 1)[0] || "membership",
          resourceId: sanitizedPayload?.resourceId || membership.id,
        });
        if (!inserted.inserted) {
          if (inserted.payloadDigest !== payloadDigest) throw webhookCollision();
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        const existingResult = await client.query(
          `SELECT clerk_user_id, provider_member_id, provider_user_id,
                  company_id, product_id, plan_id, state_changed_at,
                  period_started_at
           FROM billing_memberships
           WHERE provider_mode = $1 AND provider_membership_id = $2
           FOR UPDATE`,
          [providerMode, membership.id],
        );
        const existing = existingResult.rows[0];
        const canRestoreAccess =
          allowAccessRestore || ACCESS_RESTORE_EVENTS.has(eventName);
        let userId = existing?.clerk_user_id || "";

        if (
          existing &&
          (
            (customUserId && customUserId !== userId) ||
            existing.company_id !== membership.companyId ||
            existing.product_id !== membership.productId ||
            existing.plan_id !== membership.planId ||
            idChanged(existing.provider_member_id, membership.memberId) ||
            idChanged(existing.provider_user_id, membership.userId)
          )
        ) {
          await finishProviderEvent(
            client,
            providerMode,
            deliveryId,
            "quarantined",
            "membership_mapping_change",
          );
          await client.query("COMMIT");
          return { duplicate: false, applied: false, quarantined: true };
        }

        if (!existing) {
          const intentResult = await client.query(
            `SELECT clerk_user_id, requested_plan, company_id, product_id,
                    plan_id, provider_checkout_id, status
             FROM billing_checkout_sessions
             WHERE provider_mode = $1 AND id = $2
             FOR UPDATE`,
            [providerMode, checkoutIntentId],
          );
          const intent = intentResult.rows[0];
          if (
            !intent ||
            !customUserId ||
            intent.clerk_user_id !== customUserId ||
            intent.requested_plan !== membership.planCode ||
            intent.company_id !== membership.companyId ||
            intent.product_id !== membership.productId ||
            intent.plan_id !== membership.planId ||
            intent.provider_checkout_id !== membership.checkoutConfigurationId ||
            !["pending", "checkout_created"].includes(intent.status)
          ) {
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "quarantined",
              "checkout_intent_invalid",
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: false, quarantined: true };
          }
          userId = intent.clerk_user_id;
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
          const openMembership = await client.query(
            `SELECT provider_membership_id FROM billing_memberships
             WHERE provider_mode = $1 AND clerk_user_id = $2
               AND access_state IN ('active', 'cancel_at_period_end')
             LIMIT 1`,
            [providerMode, userId],
          );
          if (openMembership.rows[0]) {
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "quarantined",
              "conflicting_membership_blocked",
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: false, quarantined: true };
          }
        }

        if (
          existing &&
          new Date(existing.state_changed_at).getTime() > eventTimestamp.getTime()
        ) {
          await finishProviderEvent(
            client,
            providerMode,
            deliveryId,
            "ignored",
            "older_membership_state",
          );
          await client.query("COMMIT");
          return { duplicate: false, applied: false, stale: true };
        }

        if (
          existing &&
          canRestoreAccess &&
          ["active", "cancel_at_period_end"].includes(membership.accessState)
        ) {
          const conflictingRestore = await client.query(
            `SELECT provider_membership_id
             FROM billing_memberships
             WHERE provider_mode = $1 AND clerk_user_id = $2
               AND provider_membership_id <> $3
               AND access_state IN ('active', 'cancel_at_period_end')
             LIMIT 1`,
            [providerMode, userId, membership.id],
          );
          if (conflictingRestore.rows[0]) {
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "quarantined",
              "conflicting_membership_restore_blocked",
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: false, quarantined: true };
          }
        }

        const periodStartedAt =
          cycleStartedAt || existing?.period_started_at ||
          membership.renewalPeriodStart || membership.createdAt;
        await client.query(
          `INSERT INTO billing_memberships (
             provider_membership_id, clerk_user_id, provider_member_id,
             provider_user_id, company_id, product_id, plan_id, plan_code,
             provider_status, access_state, renewal_period_start,
             renewal_period_end, period_started_at, cancel_at_period_end,
             canceled_at, checkout_configuration_id, provider_created_at,
             provider_updated_at, state_changed_at, last_event_id, last_event_name,
             provider_mode, single_plan_guard
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $23, $25
           )
           ON CONFLICT (provider_mode, provider_membership_id) DO UPDATE SET
             provider_member_id = COALESCE(
               billing_memberships.provider_member_id,
               EXCLUDED.provider_member_id
             ),
             provider_user_id = COALESCE(
               billing_memberships.provider_user_id,
               EXCLUDED.provider_user_id
             ),
             provider_status = EXCLUDED.provider_status,
             access_state = CASE
               WHEN billing_memberships.access_state IN ('payment_failed', 'revoked')
                 AND EXCLUDED.access_state IN ('active', 'cancel_at_period_end')
                 AND NOT $24::boolean
               THEN billing_memberships.access_state
               ELSE EXCLUDED.access_state
             END,
             single_plan_guard = CASE
               WHEN EXCLUDED.access_state IN ('active', 'cancel_at_period_end')
                 AND (
                   billing_memberships.access_state NOT IN ('payment_failed', 'revoked')
                   OR $24::boolean
                 )
               THEN COALESCE(
                 billing_memberships.single_plan_guard,
                 EXCLUDED.single_plan_guard
               )
               ELSE billing_memberships.single_plan_guard
             END,
             renewal_period_start = EXCLUDED.renewal_period_start,
             renewal_period_end = EXCLUDED.renewal_period_end,
             period_started_at = CASE
               WHEN $22::timestamptz IS NULL THEN billing_memberships.period_started_at
               ELSE GREATEST(billing_memberships.period_started_at, $22::timestamptz)
             END,
             cancel_at_period_end = EXCLUDED.cancel_at_period_end,
             canceled_at = EXCLUDED.canceled_at,
             provider_updated_at = GREATEST(
               billing_memberships.provider_updated_at,
               EXCLUDED.provider_updated_at
             ),
             state_changed_at = CASE
               WHEN billing_memberships.access_state IN ('payment_failed', 'revoked')
                 AND EXCLUDED.access_state IN ('active', 'cancel_at_period_end')
                 AND NOT $24::boolean
               THEN billing_memberships.state_changed_at
               ELSE EXCLUDED.state_changed_at
             END,
             last_event_id = EXCLUDED.last_event_id,
             last_event_name = EXCLUDED.last_event_name,
             updated_at = now()`,
          [
            membership.id,
            userId,
            membership.memberId,
            membership.userId,
            membership.companyId,
            membership.productId,
            membership.planId,
            membership.planCode,
            membership.providerStatus,
            membership.accessState,
            membership.renewalPeriodStart,
            membership.renewalPeriodEnd,
            periodStartedAt,
            membership.cancelAtPeriodEnd,
            membership.canceledAt,
            membership.checkoutConfigurationId,
            membership.createdAt,
            membership.updatedAt,
            eventTimestamp,
            deliveryId,
            eventName,
            cycleStartedAt,
            providerMode,
            canRestoreAccess,
            userId,
          ],
        );

        await upsertPaymentHistory(client, {
          providerMode,
          userId,
          payment,
        });

        if (checkoutIntentId) {
          await client.query(
            `UPDATE billing_checkout_sessions
             SET status = 'consumed', consumed_at = COALESCE(consumed_at, now()),
                 checkout_url = NULL, updated_at = now()
             WHERE id = $1 AND provider_mode = $2 AND clerk_user_id = $3`,
            [checkoutIntentId, providerMode, userId],
          );
        }
        await finishProviderEvent(client, providerMode, deliveryId, "processed", null);
        await client.query("COMMIT");
        return { duplicate: false, applied: true };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
      }
    },

    async applyPaymentStateWebhook({
      deliveryId,
      eventName,
      eventTimestamp,
      payloadDigest,
      sanitizedPayload,
      payment,
      customUserId,
      checkoutIntentId,
      accessState,
      providerStatus = null,
    }) {
      if (!ACCESS_HOLD_STATES.has(accessState)) {
        throw new Error("Payment state webhook requires a non-entitled hold state.");
      }
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const inserted = await insertProviderEvent(client, {
          providerMode,
          deliveryId,
          eventName,
          eventTimestamp,
          payloadDigest,
          sanitizedPayload,
          companyId: payment.companyId,
          resourceType: String(eventName).split(".", 1)[0] || "payment",
          resourceId: sanitizedPayload?.resourceId || payment.id,
        });
        if (!inserted.inserted) {
          if (inserted.payloadDigest !== payloadDigest) throw webhookCollision();
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        if (payment.membershipId) {
          const updated = await client.query(
            `UPDATE billing_memberships
             SET provider_status = COALESCE($4, provider_status), access_state = $3,
                 last_payment_id = $5, state_changed_at = $6,
                 last_event_id = $7, last_event_name = $8, updated_at = now()
             WHERE provider_mode = $1 AND provider_membership_id = $2
               AND company_id = $9 AND product_id = $10 AND plan_id = $11
               AND state_changed_at <= $6
             RETURNING clerk_user_id`,
            [
              providerMode,
              payment.membershipId,
              accessState,
              providerStatus,
              payment.id,
              eventTimestamp,
              deliveryId,
              eventName,
              payment.companyId,
              payment.productId,
              payment.planId,
            ],
          );
          if (updated.rows[0]) {
            await upsertPaymentHistory(client, {
              providerMode,
              userId: String(updated.rows[0].clerk_user_id),
              payment,
            });
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "processed",
              null,
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: true };
          }

          const mappedMembership = await client.query(
            `SELECT clerk_user_id, company_id, product_id, plan_id,
                    state_changed_at
             FROM billing_memberships
             WHERE provider_mode = $1 AND provider_membership_id = $2
             FOR UPDATE`,
            [providerMode, payment.membershipId],
          );
          const existing = mappedMembership.rows[0];
          if (existing) {
            const mappingChanged =
              (customUserId && existing.clerk_user_id !== customUserId) ||
              existing.company_id !== payment.companyId ||
              existing.product_id !== payment.productId ||
              existing.plan_id !== payment.planId;
            if (mappingChanged) {
              await finishProviderEvent(
                client,
                providerMode,
                deliveryId,
                "quarantined",
                "payment_membership_mapping_change",
              );
              await client.query("COMMIT");
              return { duplicate: false, applied: false, quarantined: true };
            }
            if (
              new Date(existing.state_changed_at).getTime() >
              eventTimestamp.getTime()
            ) {
              await finishProviderEvent(
                client,
                providerMode,
                deliveryId,
                "ignored",
                "older_payment_state",
              );
              await client.query("COMMIT");
              return { duplicate: false, applied: false, stale: true };
            }
            throw billingDatabaseError(
              "The mapped membership state could not be updated.",
              "BILLING_MEMBERSHIP_STATE_UPDATE_FAILED",
            );
          }
        }

        if (
          isUuid(checkoutIntentId) &&
          isClerkUserId(customUserId) &&
          isProviderId(payment.checkoutConfigurationId, "ch")
        ) {
          const failedIntent = await client.query(
            `UPDATE billing_checkout_sessions
             SET status = 'failed', checkout_url = NULL, updated_at = now()
             WHERE id = $1 AND provider_mode = $2 AND clerk_user_id = $3
               AND company_id = $4 AND product_id = $5 AND plan_id = $6
               AND provider_checkout_id = $7
               AND status IN ('pending', 'checkout_created')
             RETURNING id`,
            [
              checkoutIntentId,
              providerMode,
              customUserId,
              payment.companyId,
              payment.productId,
              payment.planId,
              payment.checkoutConfigurationId,
            ],
          );
          if (failedIntent.rows[0]) {
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "processed",
              null,
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: true };
          }
        }

        await finishProviderEvent(
          client,
          providerMode,
          deliveryId,
          "quarantined",
          "membership_mapping_missing",
        );
        await client.query("COMMIT");
        return { duplicate: false, applied: false, quarantined: true };
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
      }
    },

    async recordProviderEvent({
      deliveryId,
      eventName,
      eventTimestamp,
      payloadDigest,
      sanitizedPayload,
      companyId,
      resourceType,
      resourceId,
      state,
      reason,
    }) {
      const result = await database.query(
        `INSERT INTO billing_provider_events (
           provider, provider_mode, delivery_id, event_name, company_id, resource_type,
           resource_id, event_created_at, payload_digest, processing_state,
           processing_error, sanitized_payload, processed_at
         ) VALUES ('whop', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
         ON CONFLICT (provider, provider_mode, delivery_id) DO NOTHING`,
        [
          providerMode,
          deliveryId,
          eventName,
          companyId || null,
          resourceType || null,
          resourceId || null,
          eventTimestamp,
          payloadDigest,
          state,
          reason || null,
          JSON.stringify(sanitizedPayload || {}),
        ],
      );
      if (result.rowCount > 0) return { duplicate: false };

      const existing = await database.query(
        `SELECT payload_digest
         FROM billing_provider_events
         WHERE provider = 'whop' AND provider_mode = $1 AND delivery_id = $2`,
        [providerMode, deliveryId],
      );
      const existingDigest = existing.rows[0]?.payload_digest;
      if (!existingDigest || existingDigest !== payloadDigest) throw webhookCollision();
      return { duplicate: true };
    },

    async purgeWebhookBodies(before) {
      const result = await database.query(
        `DELETE FROM billing_provider_events
         WHERE provider_mode = $1 AND received_at < $2`,
        [providerMode, before],
      );
      return result.rowCount;
    },
  };
}

async function settleUsage(database, { operationId, userId, targetState }) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT operation_id, clerk_user_id, usage_period_id, state
       FROM billing_analysis_usage WHERE operation_id = $1 FOR UPDATE`,
      [operationId],
    );
    const usage = result.rows[0];
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
      `UPDATE billing_analysis_usage SET state = $2, settled_at = now()
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

async function insertProviderEvent(client, input) {
  const result = await client.query(
    `INSERT INTO billing_provider_events (
       provider, provider_mode, delivery_id, event_name, company_id, resource_type,
       resource_id, event_created_at, payload_digest, processing_state,
       sanitized_payload
     ) VALUES ('whop', $1, $2, $3, $4, $5, $6, $7, $8, 'received', $9::jsonb)
     ON CONFLICT (provider, provider_mode, delivery_id) DO NOTHING
     RETURNING payload_digest`,
    [
      input.providerMode,
      input.deliveryId,
      input.eventName,
      input.companyId || null,
      input.resourceType || null,
      input.resourceId || null,
      input.eventTimestamp,
      input.payloadDigest,
      JSON.stringify(input.sanitizedPayload || {}),
    ],
  );
  if (result.rows[0]) return { inserted: true, payloadDigest: result.rows[0].payload_digest };
  const existing = await client.query(
    `SELECT payload_digest FROM billing_provider_events
     WHERE provider = 'whop' AND provider_mode = $1 AND delivery_id = $2`,
    [input.providerMode, input.deliveryId],
  );
  return { inserted: false, payloadDigest: existing.rows[0]?.payload_digest || "" };
}

async function finishProviderEvent(
  client,
  providerMode,
  deliveryId,
  state,
  reason,
) {
  await client.query(
    `UPDATE billing_provider_events
     SET processing_state = $3, processing_error = $4, processed_at = now()
     WHERE provider = 'whop' AND provider_mode = $1 AND delivery_id = $2`,
    [providerMode, deliveryId, state, reason],
  );
}

function mapSubscription(row) {
  return {
    id: String(row.provider_membership_id),
    userId: row.clerk_user_id,
    providerProductId: row.product_id,
    providerPlanId: row.plan_id,
    providerStatus: row.provider_status,
    status: row.access_state,
    renewsAt: row.cancel_at_period_end ? null : row.renewal_period_end,
    endsAt: row.renewal_period_end,
    periodStartedAt: row.period_started_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    updatedAt: row.provider_updated_at,
  };
}

function mapPaymentHistory(row) {
  return {
    reference: String(row.provider_payment_id).slice(-10),
    planId: String(row.plan_code),
    status: String(row.display_status),
    providerSubstatus: String(row.provider_substatus),
    paidAt: row.paid_at,
    updatedAt: row.provider_updated_at,
  };
}

async function upsertPaymentHistory(
  client,
  { providerMode, userId, payment },
) {
  if (!payment?.displayStatus) return false;
  const providerUpdatedAt =
    payment.updatedAt || payment.createdAt || new Date(0);
  const result = await client.query(
    `INSERT INTO billing_payment_history (
       provider_mode, provider_payment_id, clerk_user_id,
       provider_membership_id, plan_code, display_status,
       provider_substatus, paid_at, provider_created_at,
       provider_updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (provider_mode, provider_payment_id) DO UPDATE SET
       provider_membership_id = COALESCE(
         billing_payment_history.provider_membership_id,
         EXCLUDED.provider_membership_id
       ),
       display_status = EXCLUDED.display_status,
       provider_substatus = EXCLUDED.provider_substatus,
       paid_at = COALESCE(
         billing_payment_history.paid_at,
         EXCLUDED.paid_at
       ),
       provider_updated_at = EXCLUDED.provider_updated_at,
       updated_at = now()
     WHERE billing_payment_history.clerk_user_id = EXCLUDED.clerk_user_id
       AND billing_payment_history.plan_code = EXCLUDED.plan_code
       AND billing_payment_history.provider_updated_at <= EXCLUDED.provider_updated_at
     RETURNING clerk_user_id`,
    [
      providerMode,
      payment.id,
      userId,
      payment.membershipId,
      payment.planCode,
      payment.displayStatus,
      payment.substatus,
      payment.paidAt,
      payment.createdAt,
      providerUpdatedAt,
    ],
  );
  if (result.rowCount === 1) return true;

  const existing = await client.query(
    `SELECT clerk_user_id, plan_code, provider_updated_at
     FROM billing_payment_history
     WHERE provider_mode = $1 AND provider_payment_id = $2`,
    [providerMode, payment.id],
  );
  const row = existing.rows[0];
  if (row && row.clerk_user_id === userId && row.plan_code === payment.planCode) {
    return false;
  }
  throw billingConflict(
    "A Whop payment attempted to change account ownership.",
    "PAYMENT_MAPPING_CONFLICT",
  );
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

function idChanged(existing, next) {
  return Boolean(existing && next && existing !== next);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ""));
}

function isClerkUserId(value) {
  return /^user_[A-Za-z0-9]{10,80}$/.test(String(value || ""));
}

function isProviderId(value, prefix) {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{6,120}$`)
    .test(String(value || ""));
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
      : "Your monthly Zenaian question allowance has been used.",
  );
  error.status = 429;
  error.code = "QUOTA_EXHAUSTED";
  error.quota = details;
  return error;
}

function webhookCollision() {
  return billingConflict(
    "A webhook delivery ID was reused with different content.",
    "WEBHOOK_DELIVERY_COLLISION",
  );
}

function billingConflict(message, code) {
  return Object.assign(new Error(message), { status: 409, code });
}

function billingDatabaseError(message, code = "BILLING_DATABASE_UNAVAILABLE") {
  return Object.assign(new Error(message), { status: 503, code });
}

function normalizeDatabaseError(error) {
  if (error?.code && /^[A-Z][A-Z0-9_]+$/.test(error.code)) return error;
  if (
    error?.code === "23505" &&
    error?.constraint === "billing_memberships_one_guarded_open_per_user_idx"
  ) {
    return billingConflict(
      "This account already has an active paid subscription.",
      "SUBSCRIPTION_ALREADY_ACTIVE",
    );
  }
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
