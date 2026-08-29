import { randomUUID } from "node:crypto";
import pg from "pg";
import { observePostgresPool } from "./postgres-runtime.js";

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
  globalConcurrentReservationLimit = 40,
  globalStartsPerMinuteLimit = 300,
  reservationTtlMs = 300000,
  deletionGuard = null,
}) {
  if (!pool && !connectionString) {
    throw new Error("DATABASE_URL is required when billing is enabled.");
  }
  if (!new Set(["test", "live"]).has(providerMode)) {
    throw new Error("Whop billing store mode must be test or live.");
  }
  if (deletionGuard != null && typeof deletionGuard !== "function") {
    throw new Error("Whop billing deletionGuard must be a function.");
  }
  for (const [name, value] of [
    ["globalConcurrentReservationLimit", globalConcurrentReservationLimit],
    ["globalStartsPerMinuteLimit", globalStartsPerMinuteLimit],
    ["reservationTtlMs", reservationTtlMs],
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
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
  if (ownsPool) observePostgresPool(database, "billing");
  const assertUserAllowed = (client, userId) =>
    assertBillingUserAllowed(client, userId, deletionGuard);

  return {
    async initialize() {
      const result = await database.query(
        `SELECT to_regclass('billing_memberships') AS memberships_table,
                to_regclass('billing_payment_history') AS payment_history_table,
                to_regclass('billing_checkout_tombstones') AS tombstone_table,
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
        !result.rows[0]?.tombstone_table ||
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

    async listPendingCheckoutTombstones(limit = 100) {
      const boundedLimit = Math.max(
        1,
        Math.min(500, Number.isSafeInteger(limit) ? limit : 100),
      );
      const result = await database.query(
        `SELECT provider_checkout_id, provider_membership_id, company_id,
                product_id, plan_id, plan_code, provider_updated_at
         FROM billing_checkout_tombstones
         WHERE provider_mode = $1
           AND termination_state = 'pending'
           AND provider_membership_id IS NOT NULL
         ORDER BY COALESCE(termination_attempted_at, created_at) ASC,
                  provider_checkout_id
         LIMIT $2`,
        [providerMode, boundedLimit],
      );
      return result.rows.map(mapCheckoutTombstone);
    },

    async confirmCheckoutTombstoneTermination(membership) {
      const result = await database.query(
        `UPDATE billing_checkout_tombstones
         SET termination_state = 'confirmed',
             termination_confirmed_at = COALESCE(termination_confirmed_at, now()),
             provider_updated_at = CASE
               WHEN $8::timestamptz IS NULL THEN provider_updated_at
               ELSE GREATEST(
                 COALESCE(provider_updated_at, $8::timestamptz),
                 $8::timestamptz
               )
             END
         WHERE provider_mode = $1 AND provider_checkout_id = $2
           AND provider_membership_id = $3
           AND company_id = $4 AND product_id = $5 AND plan_id = $6
           AND plan_code = $7
         RETURNING provider_checkout_id`,
        [
          providerMode,
          membership.checkoutConfigurationId,
          membership.id,
          membership.companyId,
          membership.productId,
          membership.planId,
          membership.planCode,
          membership.updatedAt || null,
        ],
      );
      if (result.rowCount !== 1) {
        throw billingConflict(
          "The deleted-account checkout termination mapping changed.",
          "CHECKOUT_TOMBSTONE_MAPPING_CHANGED",
        );
      }
      return true;
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
        await assertUserAllowed(client, userId);
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

        await enforceDistributedAnalysisAdmission(client, {
          globalConcurrentReservationLimit,
          globalStartsPerMinuteLimit,
          reservationTtlMs,
        });

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
        await assertUserAllowed(client, userId);

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
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const intentResult = await client.query(
          `SELECT clerk_user_id
           FROM billing_checkout_sessions
           WHERE id = $1 AND provider_mode = $2 AND status = 'pending'`,
          [id, providerMode],
        );
        const userId = intentResult.rows[0]?.clerk_user_id;
        if (!userId) {
          throw billingConflict(
            "The checkout intent is no longer active.",
            "CHECKOUT_EXPIRED",
          );
        }
        // A deletion request may begin while the remote checkout is being
        // created. Re-check under the same per-user advisory lock before the
        // provider checkout identifier or URL becomes visible locally.
        await assertUserAllowed(client, userId);
        const result = await client.query(
          `UPDATE billing_checkout_sessions
           SET status = 'checkout_created', provider_checkout_id = $3,
               checkout_url = $4, updated_at = now()
           WHERE id = $1 AND provider_mode = $2 AND status = 'pending'`,
          [id, providerMode, checkoutId, checkoutUrl],
        );
        if (result.rowCount !== 1) {
          throw billingConflict(
            "The checkout intent is no longer active.",
            "CHECKOUT_EXPIRED",
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await rollbackQuietly(client);
        throw normalizeDatabaseError(error);
      } finally {
        client.release();
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
        const providerEvent = {
          providerMode,
          deliveryId,
          eventName,
          eventTimestamp,
          payloadDigest,
          sanitizedPayload,
          companyId: membership.companyId,
          resourceType: String(eventName).split(".", 1)[0] || "membership",
          resourceId: sanitizedPayload?.resourceId || membership.id,
        };

        // A provider checkout can remain payable after its owning account has
        // been deleted. The de-identified tombstone is authoritative over all
        // live/legacy mapping paths: it can only request provider termination
        // and can never recreate a local entitlement.
        const tombstoneMatch = await selectCheckoutTombstone(client, {
          providerMode,
          checkoutConfigurationId: membership.checkoutConfigurationId,
          companyId: membership.companyId,
          productId: membership.productId,
          planId: membership.planId,
          planCode: membership.planCode,
          lock: true,
        });
        if (tombstoneMatch.found) {
          const result = await applyCheckoutTombstoneMembershipEvent(client, {
            providerMode,
            providerEvent,
            membership,
            tombstoneMatch,
          });
          await client.query("COMMIT");
          return result;
        }

        if (await isDuplicateProviderEvent(client, providerEvent)) {
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        const canRestoreAccess =
          allowAccessRestore || ACCESS_RESTORE_EVENTS.has(eventName);
        const candidateExisting = await selectMembershipMapping(client, {
          providerMode,
          membershipId: membership.id,
          lock: false,
        });
        let candidateCheckout = null;
        let userId = candidateExisting?.clerk_user_id || "";
        if (!candidateExisting) {
          candidateCheckout = await selectCheckoutMapping(client, {
            providerMode,
            checkoutConfigurationId: membership.checkoutConfigurationId,
            companyId: membership.companyId,
            productId: membership.productId,
            planId: membership.planId,
            planCode: membership.planCode,
            legacyCheckoutIntentId: checkoutIntentId,
            legacyUserId: customUserId,
            statuses: ["pending", "checkout_created"],
            lock: false,
          });
          if (candidateCheckout.ambiguous || !candidateCheckout.intent) {
            const candidateArchive =
              payment?.id && !candidateCheckout.ambiguous
                ? await selectArchivedPaymentMapping(client, {
                    providerMode,
                    paymentId: payment.id,
                    lock: false,
                  })
                : null;
            const archived = candidateArchive
              ? await applyArchivedPaymentEvidence(client, {
                  providerMode,
                  payment,
                  eventName,
                  eventTimestamp,
                  candidate: candidateArchive,
                })
              : { mapped: false };
            const inserted = await insertProviderEvent(client, providerEvent);
            if (!inserted.inserted) {
              if (inserted.payloadDigest !== payloadDigest) throw webhookCollision();
              await client.query("COMMIT");
              return { duplicate: true, applied: false };
            }
            if (archived.mapped) {
              await finishProviderEvent(
                client,
                providerMode,
                deliveryId,
                archived.stale ? "ignored" : "processed",
                archived.stale ? "older_archived_payment_state" : null,
              );
              await client.query("COMMIT");
              return {
                duplicate: false,
                applied: false,
                archived: archived.applied,
                ...(archived.stale ? { stale: true } : {}),
              };
            }
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "quarantined",
              candidateCheckout.ambiguous
                ? "checkout_mapping_ambiguous"
                : "checkout_mapping_missing",
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: false, quarantined: true };
          }
          userId = candidateCheckout.intent.clerk_user_id;
        }

        // Never hold a user billing row while waiting for the privacy lock.
        // Deletion takes this advisory lock before it archives/deletes rows.
        await assertUserAllowed(client, userId);
        const inserted = await insertProviderEvent(client, providerEvent);
        if (!inserted.inserted) {
          if (inserted.payloadDigest !== payloadDigest) throw webhookCollision();
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        const existing = await selectMembershipMapping(client, {
          providerMode,
          membershipId: membership.id,
          lock: true,
        });
        if (
          existing &&
          (
            existing.clerk_user_id !== userId ||
            existing.company_id !== membership.companyId ||
            existing.product_id !== membership.productId ||
            existing.plan_id !== membership.planId ||
            existing.checkout_configuration_id !==
              membership.checkoutConfigurationId ||
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

        let mappedCheckoutIntentId = "";
        if (!existing) {
          const mapping = await selectCheckoutMapping(client, {
            providerMode,
            checkoutConfigurationId: membership.checkoutConfigurationId,
            companyId: membership.companyId,
            productId: membership.productId,
            planId: membership.planId,
            planCode: membership.planCode,
            legacyCheckoutIntentId: checkoutIntentId,
            legacyUserId: customUserId,
            statuses: ["pending", "checkout_created"],
            lock: true,
          });
          const intent = mapping.intent;
          if (
            mapping.ambiguous ||
            !intent ||
            intent.clerk_user_id !== userId ||
            (candidateCheckout?.intent &&
              String(intent.id) !== String(candidateCheckout.intent.id))
          ) {
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              "quarantined",
              mapping.ambiguous
                ? "checkout_mapping_ambiguous"
                : "checkout_mapping_changed",
            );
            await client.query("COMMIT");
            return { duplicate: false, applied: false, quarantined: true };
          }
          mappedCheckoutIntentId = String(intent.id);
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
          eventTimestamp,
        });

        if (mappedCheckoutIntentId) {
          await client.query(
            `UPDATE billing_checkout_sessions
             SET status = 'consumed', consumed_at = COALESCE(consumed_at, now()),
                  provider_checkout_id = COALESCE(provider_checkout_id, $4),
                  checkout_url = NULL, updated_at = now()
             WHERE id = $1 AND provider_mode = $2 AND clerk_user_id = $3
               AND (provider_checkout_id = $4 OR provider_checkout_id IS NULL)`,
            [
              mappedCheckoutIntentId,
              providerMode,
              userId,
              membership.checkoutConfigurationId,
            ],
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
        const providerEvent = {
          providerMode,
          deliveryId,
          eventName,
          eventTimestamp,
          payloadDigest,
          sanitizedPayload,
          companyId: payment.companyId,
          resourceType: String(eventName).split(".", 1)[0] || "payment",
          resourceId: sanitizedPayload?.resourceId || payment.id,
        };
        if (await isDuplicateProviderEvent(client, providerEvent)) {
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        const candidateExisting = payment.membershipId
          ? await selectMembershipMapping(client, {
              providerMode,
              membershipId: payment.membershipId,
              lock: false,
            })
          : null;
        const candidateCheckout = candidateExisting
          ? null
          : await selectCheckoutMapping(client, {
              providerMode,
              checkoutConfigurationId: payment.checkoutConfigurationId,
              companyId: payment.companyId,
              productId: payment.productId,
              planId: payment.planId,
              planCode: payment.planCode,
              legacyCheckoutIntentId: checkoutIntentId,
              legacyUserId: customUserId,
              statuses: ["pending", "checkout_created"],
              lock: false,
            });
        const candidateArchive =
          !candidateExisting &&
          !candidateCheckout?.intent &&
          !candidateCheckout?.ambiguous
            ? await selectArchivedPaymentMapping(client, {
                providerMode,
                paymentId: payment.id,
                lock: false,
              })
            : null;
        const candidateUserId =
          candidateExisting?.clerk_user_id ||
          candidateCheckout?.intent?.clerk_user_id ||
          "";
        if (
          !candidateUserId ||
          candidateCheckout?.ambiguous
        ) {
          const archived = candidateArchive
            ? await applyArchivedPaymentEvidence(client, {
                providerMode,
                payment,
                eventName,
                eventTimestamp,
                candidate: candidateArchive,
              })
            : { mapped: false };
          const inserted = await insertProviderEvent(client, providerEvent);
          if (!inserted.inserted) {
            if (inserted.payloadDigest !== payloadDigest) throw webhookCollision();
            await client.query("COMMIT");
            return { duplicate: true, applied: false };
          }
          if (archived.mapped) {
            await finishProviderEvent(
              client,
              providerMode,
              deliveryId,
              archived.stale ? "ignored" : "processed",
              archived.stale ? "older_archived_payment_state" : null,
            );
            await client.query("COMMIT");
            return {
              duplicate: false,
              applied: false,
              archived: archived.applied,
              ...(archived.stale ? { stale: true } : {}),
            };
          }
          await finishProviderEvent(
            client,
            providerMode,
            deliveryId,
            "quarantined",
            candidateCheckout?.ambiguous
              ? "checkout_mapping_ambiguous"
              : "membership_mapping_missing",
          );
          await client.query("COMMIT");
          return { duplicate: false, applied: false, quarantined: true };
        }

        await assertUserAllowed(client, candidateUserId);
        const inserted = await insertProviderEvent(client, providerEvent);
        if (!inserted.inserted) {
          if (inserted.payloadDigest !== payloadDigest) throw webhookCollision();
          await client.query("COMMIT");
          return { duplicate: true, applied: false };
        }

        if (payment.membershipId) {
          const existing = await selectMembershipMapping(client, {
            providerMode,
            membershipId: payment.membershipId,
            lock: true,
          });
          if (existing) {
            const mappingChanged =
              existing.clerk_user_id !== candidateUserId ||
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

            const updated = await client.query(
              `UPDATE billing_memberships
               SET provider_status = COALESCE($4, provider_status),
                   access_state = $3, last_payment_id = $5,
                   state_changed_at = $6, last_event_id = $7,
                   last_event_name = $8, updated_at = now()
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
            if (!updated.rows[0]) {
              throw billingDatabaseError(
                "The mapped membership state could not be updated.",
                "BILLING_MEMBERSHIP_STATE_UPDATE_FAILED",
              );
            }
            await upsertPaymentHistory(client, {
              providerMode,
              userId: String(existing.clerk_user_id),
              payment,
              eventTimestamp,
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
        }

        const checkoutMapping = await selectCheckoutMapping(client, {
          providerMode,
          checkoutConfigurationId: payment.checkoutConfigurationId,
          companyId: payment.companyId,
          productId: payment.productId,
          planId: payment.planId,
          planCode: payment.planCode,
          legacyCheckoutIntentId: checkoutIntentId,
          legacyUserId: customUserId,
          statuses: ["pending", "checkout_created"],
          lock: true,
        });
        if (
          checkoutMapping.ambiguous ||
          (checkoutMapping.intent &&
            (
              checkoutMapping.intent.clerk_user_id !== candidateUserId ||
              (candidateCheckout?.intent &&
                String(checkoutMapping.intent.id) !==
                  String(candidateCheckout.intent.id))
            ))
        ) {
          await finishProviderEvent(
            client,
            providerMode,
            deliveryId,
            "quarantined",
            "checkout_mapping_ambiguous",
          );
          await client.query("COMMIT");
          return { duplicate: false, applied: false, quarantined: true };
        }
        if (checkoutMapping.intent) {
          const intent = checkoutMapping.intent;
          const failedIntent = await client.query(
            `UPDATE billing_checkout_sessions
              SET status = 'failed',
                  provider_checkout_id = COALESCE(provider_checkout_id, $7),
                  checkout_url = NULL, updated_at = now()
             WHERE id = $1 AND provider_mode = $2 AND clerk_user_id = $3
                AND company_id = $4 AND product_id = $5 AND plan_id = $6
                AND (provider_checkout_id = $7 OR provider_checkout_id IS NULL)
                AND status IN ('pending', 'checkout_created')
             RETURNING id`,
            [
              intent.id,
              providerMode,
              intent.clerk_user_id,
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

async function selectMembershipMapping(
  client,
  { providerMode, membershipId, lock },
) {
  const result = await client.query(
    `SELECT clerk_user_id, provider_member_id, provider_user_id,
            company_id, product_id, plan_id, checkout_configuration_id,
            state_changed_at, period_started_at
     FROM billing_memberships
     WHERE provider_mode = $1 AND provider_membership_id = $2
     ${lock ? "FOR UPDATE" : ""}`,
    [providerMode, membershipId],
  );
  return result.rows[0] || null;
}

async function selectArchivedPaymentMapping(
  client,
  { providerMode, paymentId, lock },
) {
  if (!isProviderId(paymentId, "pay")) return null;
  const result = await client.query(
    `SELECT record_id, record_category, subject_lookup_hmac,
            former_account_hmac, hmac_key_version, company_id,
            provider_checkout_id, provider_membership_id,
            provider_payment_id, product_id, plan_id, plan_code,
            settlement_amount, currency, tax_amount, tax_behavior,
            billing_reason, status, contracted_at, paid_at, canceled_at,
            refunded_at, disputed_at, provider_updated_at
     FROM legal_retention.transaction_records
     WHERE provider = 'whop' AND provider_mode = $1
       AND provider_payment_id = $2
     ORDER BY CASE record_category
       WHEN 'payment_supply' THEN 0
       WHEN 'contract_withdrawal' THEN 1
       ELSE 2
     END
     LIMIT 1
     ${lock ? "FOR UPDATE" : ""}`,
    [providerMode, paymentId],
  );
  return result.rows[0] || null;
}

function archiveCategoryForPayment(payment, eventName) {
  if (
    String(eventName || "").startsWith("refund.") ||
    payment?.displayStatus === "refunded"
  ) {
    return "contract_withdrawal";
  }
  if (
    String(eventName || "").startsWith("dispute.") ||
    payment?.displayStatus === "disputed" ||
    /^(?:dispute_|resolution_|open_dispute|open_resolution)/.test(
      String(payment?.substatus || ""),
    )
  ) {
    return "complaint_dispute";
  }
  return "";
}

function archivedPaymentMappingMatches(row, payment) {
  return Boolean(
    row &&
    row.company_id === payment.companyId &&
    row.product_id === payment.productId &&
    row.plan_id === payment.planId &&
    row.plan_code === payment.planCode,
  );
}

async function applyArchivedPaymentEvidence(
  client,
  { providerMode, payment, eventName, eventTimestamp, candidate },
) {
  const category = archiveCategoryForPayment(payment, eventName);
  if (!category || !archivedPaymentMappingMatches(candidate, payment)) {
    return { applied: false, mapped: false };
  }
  const locked = await selectArchivedPaymentMapping(client, {
    providerMode,
    paymentId: payment.id,
    lock: true,
  });
  if (
    !locked ||
    String(locked.record_id) !== String(candidate.record_id) ||
    !archivedPaymentMappingMatches(locked, payment)
  ) {
    return { applied: false, mapped: false };
  }

  const eventAt = category === "contract_withdrawal"
    ? payment.refundedAt || payment.updatedAt || eventTimestamp
    : latestDate(payment.disputedAt, payment.updatedAt) || eventTimestamp;
  const providerUpdatedAt = latestDate(payment.updatedAt, eventAt) || eventAt;
  const years = category === "complaint_dispute" ? 3 : 5;
  const retentionBasis =
    category === "complaint_dispute"
      ? "Korean E-Commerce Act complaint/dispute record - 3 years"
      : "Korean E-Commerce Act contract/withdrawal record - 5 years";
  const refundedAt =
    category === "contract_withdrawal" ? eventAt : locked.refunded_at;
  const disputedAt = category === "complaint_dispute"
    ? locked.disputed_at || payment.disputedAt || eventAt
    : locked.disputed_at;
  const result = await client.query(
    `INSERT INTO legal_retention.transaction_records (
       record_id, record_category, subject_lookup_hmac,
       former_account_hmac, hmac_key_version, provider, provider_mode,
       company_id, provider_checkout_id, provider_membership_id,
       provider_payment_id, product_id, plan_id, plan_code,
       settlement_amount, currency, tax_amount, tax_behavior,
       billing_reason, status, contracted_at, paid_at, canceled_at,
       refunded_at, disputed_at, retention_basis, retention_expires_at,
       provider_updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'whop', $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
       $23, $24, $25, $26, $27
     )
     ON CONFLICT (
       provider, provider_mode, record_category, provider_payment_id
     ) WHERE provider_payment_id IS NOT NULL
     DO UPDATE SET
       provider_checkout_id = COALESCE(
         legal_retention.transaction_records.provider_checkout_id,
         EXCLUDED.provider_checkout_id
       ),
       provider_membership_id = COALESCE(
         legal_retention.transaction_records.provider_membership_id,
         EXCLUDED.provider_membership_id
       ),
       settlement_amount = COALESCE(
         EXCLUDED.settlement_amount,
         legal_retention.transaction_records.settlement_amount
       ),
       currency = COALESCE(
         EXCLUDED.currency,
         legal_retention.transaction_records.currency
       ),
       tax_amount = COALESCE(
         EXCLUDED.tax_amount,
         legal_retention.transaction_records.tax_amount
       ),
       tax_behavior = COALESCE(
         EXCLUDED.tax_behavior,
         legal_retention.transaction_records.tax_behavior
       ),
       billing_reason = COALESCE(
         EXCLUDED.billing_reason,
         legal_retention.transaction_records.billing_reason
       ),
       status = EXCLUDED.status,
       paid_at = COALESCE(
         legal_retention.transaction_records.paid_at,
         EXCLUDED.paid_at
       ),
       refunded_at = COALESCE(
         legal_retention.transaction_records.refunded_at,
         EXCLUDED.refunded_at
       ),
       disputed_at = COALESCE(
         legal_retention.transaction_records.disputed_at,
         EXCLUDED.disputed_at
       ),
       retention_basis = EXCLUDED.retention_basis,
       retention_expires_at = GREATEST(
         legal_retention.transaction_records.retention_expires_at,
         EXCLUDED.retention_expires_at
       ),
       provider_updated_at = EXCLUDED.provider_updated_at,
       updated_at = now()
     WHERE legal_retention.transaction_records.provider_updated_at IS NULL
        OR legal_retention.transaction_records.provider_updated_at <=
           EXCLUDED.provider_updated_at
     RETURNING record_id`,
    [
      randomUUID(),
      category,
      locked.subject_lookup_hmac,
      locked.former_account_hmac,
      locked.hmac_key_version,
      providerMode,
      payment.companyId,
      payment.checkoutConfigurationId || locked.provider_checkout_id,
      payment.membershipId || locked.provider_membership_id,
      payment.id,
      payment.productId,
      payment.planId,
      payment.planCode,
      payment.settlementAmount ?? locked.settlement_amount,
      payment.currency || locked.currency,
      payment.taxAmount ?? locked.tax_amount,
      payment.taxBehavior || locked.tax_behavior,
      payment.billingReason || locked.billing_reason,
      payment.substatus || payment.displayStatus || locked.status,
      locked.contracted_at,
      payment.paidAt || locked.paid_at,
      locked.canceled_at,
      refundedAt,
      disputedAt,
      retentionBasis,
      addUtcYears(eventAt, years),
      providerUpdatedAt,
    ],
  );
  return {
    applied: result.rowCount === 1,
    mapped: true,
    stale: result.rowCount !== 1,
  };
}

function addUtcYears(value, years) {
  const date = new Date(value);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date;
}

function latestDate(...values) {
  const dates = values.filter(
    (value) => value instanceof Date && Number.isFinite(value.getTime()),
  );
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((value) => value.getTime())));
}

async function selectCheckoutTombstone(
  client,
  {
    providerMode,
    checkoutConfigurationId,
    companyId,
    productId,
    planId,
    planCode,
    lock = false,
  },
) {
  if (!isProviderId(checkoutConfigurationId, "ch")) {
    return { found: false, matches: false, tombstone: null };
  }
  const result = await client.query(
    `SELECT provider_checkout_id, prior_membership_ids,
            provider_membership_id, company_id, product_id, plan_id,
            plan_code, termination_state, provider_updated_at
     FROM billing_checkout_tombstones AS tombstone
     WHERE tombstone.provider_mode = $1
       AND tombstone.provider_checkout_id = $2
     ${lock ? "FOR UPDATE" : ""}`,
    [providerMode, checkoutConfigurationId],
  );
  const tombstone = result.rows[0] || null;
  if (!tombstone) return { found: false, matches: false, tombstone: null };
  return {
    found: true,
    matches:
      tombstone.company_id === companyId &&
      tombstone.product_id === productId &&
      tombstone.plan_id === planId &&
      tombstone.plan_code === planCode,
    tombstone,
  };
}

async function applyCheckoutTombstoneMembershipEvent(
  client,
  { providerMode, providerEvent, membership, tombstoneMatch },
) {
  const duplicate = await isDuplicateProviderEvent(client, providerEvent);
  const tombstone = tombstoneMatch.tombstone;
  if (!tombstoneMatch.matches) {
    if (!duplicate) {
      const inserted = await insertProviderEvent(client, providerEvent);
      if (!inserted.inserted && inserted.payloadDigest !== providerEvent.payloadDigest) {
        throw webhookCollision();
      }
      await finishProviderEvent(
        client,
        providerMode,
        providerEvent.deliveryId,
        "quarantined",
        "checkout_tombstone_catalog_mismatch",
      );
    }
    return {
      duplicate,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired: membership.accessState !== "inactive",
      terminationConfirmationRequired: false,
    };
  }

  if ((tombstone.prior_membership_ids || []).includes(membership.id)) {
    if (!duplicate) {
      const inserted = await insertProviderEvent(client, providerEvent);
      if (!inserted.inserted && inserted.payloadDigest !== providerEvent.payloadDigest) {
        throw webhookCollision();
      }
      await finishProviderEvent(
        client,
        providerMode,
        providerEvent.deliveryId,
        "quarantined",
        "deleted_account_original_membership_event",
      );
    }
    return {
      duplicate,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired: false,
    };
  }

  if (
    tombstone.provider_membership_id &&
    tombstone.provider_membership_id !== membership.id &&
    tombstone.termination_state !== "confirmed"
  ) {
    if (!duplicate) {
      const inserted = await insertProviderEvent(client, providerEvent);
      if (!inserted.inserted && inserted.payloadDigest !== providerEvent.payloadDigest) {
        throw webhookCollision();
      }
      await finishProviderEvent(
        client,
        providerMode,
        providerEvent.deliveryId,
        "quarantined",
        "checkout_tombstone_membership_mismatch",
      );
    }
    return {
      duplicate,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired: membership.accessState !== "inactive",
      terminationConfirmationRequired: false,
    };
  }

  const terminationRequired = membership.accessState !== "inactive";
  if (duplicate) {
    return {
      duplicate: true,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired:
        terminationRequired && tombstone.termination_state !== "confirmed",
    };
  }

  const inserted = await insertProviderEvent(client, providerEvent);
  if (!inserted.inserted) {
    if (inserted.payloadDigest !== providerEvent.payloadDigest) throw webhookCollision();
    return {
      duplicate: true,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired:
        terminationRequired && tombstone.termination_state !== "confirmed",
    };
  }

  const updated = await client.query(
    `UPDATE billing_checkout_tombstones AS tombstone
     SET provider_membership_id = $3,
         termination_state = $4,
         termination_attempted_at = CASE
           WHEN $4 = 'pending' THEN now()
           ELSE tombstone.termination_attempted_at
         END,
         termination_confirmed_at = CASE
           WHEN $4 = 'confirmed'
           THEN COALESCE(tombstone.termination_confirmed_at, now())
           ELSE NULL
         END,
         provider_updated_at = CASE
           WHEN $5::timestamptz IS NULL THEN tombstone.provider_updated_at
           ELSE GREATEST(
             COALESCE(tombstone.provider_updated_at, $5::timestamptz),
             $5::timestamptz
           )
         END
     WHERE tombstone.provider_mode = $1
       AND tombstone.provider_checkout_id = $2
       AND (
         tombstone.provider_membership_id IS NULL OR
         tombstone.provider_membership_id = $3 OR
         tombstone.termination_state = 'confirmed'
       )
       AND NOT ($3 = ANY(tombstone.prior_membership_ids))
       AND NOT EXISTS (
         SELECT 1 FROM billing_checkout_tombstones AS other
         WHERE other.provider_mode = $1
           AND other.provider_membership_id = $3
           AND other.provider_checkout_id <> $2
       )
     RETURNING provider_checkout_id`,
    [
      providerMode,
      membership.checkoutConfigurationId,
      membership.id,
      terminationRequired ? "pending" : "confirmed",
      membership.updatedAt || null,
    ],
  );
  if (updated.rowCount !== 1) {
    await finishProviderEvent(
      client,
      providerMode,
      providerEvent.deliveryId,
      "quarantined",
      "checkout_tombstone_membership_mismatch",
    );
    return {
      duplicate: false,
      applied: false,
      quarantined: true,
      tombstoned: true,
      terminationRequired: membership.accessState !== "inactive",
      terminationConfirmationRequired: false,
    };
  }

  await finishProviderEvent(
    client,
    providerMode,
    providerEvent.deliveryId,
    "quarantined",
    "deleted_account_checkout_completed",
  );
  return {
    duplicate: false,
    applied: false,
    quarantined: true,
    tombstoned: true,
    terminationRequired,
  };
}

async function selectCheckoutMapping(
  client,
  {
    providerMode,
    checkoutConfigurationId,
    companyId,
    productId,
    planId,
    planCode,
    legacyCheckoutIntentId,
    legacyUserId,
    statuses,
    lock = false,
  },
) {
  if (!isProviderId(checkoutConfigurationId, "ch")) {
    return { intent: null, ambiguous: false };
  }

  // The provider-generated checkout configuration is the authoritative join
  // key. User-controlled or provider-echoed metadata is never allowed to
  // override a matching local checkout.
  const providerMatch = await client.query(
    `SELECT id, clerk_user_id, requested_plan, company_id, product_id,
            plan_id, provider_checkout_id, status
     FROM billing_checkout_sessions
     WHERE provider_mode = $1 AND provider_checkout_id = $2
       AND company_id = $3 AND product_id = $4 AND plan_id = $5
       AND requested_plan = $6 AND status = ANY($7::text[])
     ORDER BY created_at ASC
     LIMIT 2
     ${lock ? "FOR UPDATE" : ""}`,
    [
      providerMode,
      checkoutConfigurationId,
      companyId,
      productId,
      planId,
      planCode,
      statuses,
    ],
  );
  if (providerMatch.rows.length > 1) {
    return { intent: null, ambiguous: true };
  }
  if (providerMatch.rows[0]) {
    return { intent: providerMatch.rows[0], ambiguous: false };
  }

  // Compatibility for already-issued checkouts that carried the former
  // Clerk/intent metadata. Every provider and catalog identifier must still
  // match the local row, so spoofed metadata cannot claim another checkout.
  if (!isUuid(legacyCheckoutIntentId) || !isClerkUserId(legacyUserId)) {
    return { intent: null, ambiguous: false };
  }
  const legacyMatch = await client.query(
    `SELECT id, clerk_user_id, requested_plan, company_id, product_id,
            plan_id, provider_checkout_id, status
     FROM billing_checkout_sessions
     WHERE provider_mode = $1 AND id = $2 AND clerk_user_id = $3
       AND (provider_checkout_id = $4 OR provider_checkout_id IS NULL)
       AND company_id = $5
       AND product_id = $6 AND plan_id = $7 AND requested_plan = $8
       AND status = ANY($9::text[])
     ${lock ? "FOR UPDATE" : ""}`,
    [
      providerMode,
      legacyCheckoutIntentId,
      legacyUserId,
      checkoutConfigurationId,
      companyId,
      productId,
      planId,
      planCode,
      statuses,
    ],
  );
  return { intent: legacyMatch.rows[0] || null, ambiguous: false };
}

async function assertBillingUserAllowed(client, userId, deletionGuard) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
  const result = await client.query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM privacy_deletion_queue WHERE clerk_user_id = $1
     ) AS allowed`,
    [userId],
  );
  if (result.rows[0]?.allowed !== true) {
    throw accountDeletionInProgress();
  }
  // The raw-ID queue is intentionally removed after deletion completes. The
  // durable privacy audit is HMAC-keyed, so its lookup remains in the privacy
  // store and is injected here rather than duplicating key material in billing.
  if (deletionGuard && await deletionGuard(userId)) {
    throw accountDeletionInProgress();
  }
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

async function isDuplicateProviderEvent(client, input) {
  const existing = await client.query(
    `SELECT payload_digest FROM billing_provider_events
     WHERE provider = 'whop' AND provider_mode = $1 AND delivery_id = $2`,
    [input.providerMode, input.deliveryId],
  );
  const digest = existing.rows[0]?.payload_digest;
  if (!digest) return false;
  if (digest !== input.payloadDigest) throw webhookCollision();
  return true;
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

function mapCheckoutTombstone(row) {
  return {
    checkoutConfigurationId: String(row.provider_checkout_id),
    membershipId: String(row.provider_membership_id),
    companyId: String(row.company_id),
    productId: String(row.product_id),
    planId: String(row.plan_id),
    planCode: String(row.plan_code),
    updatedAt: row.provider_updated_at || null,
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
  { providerMode, userId, payment, eventTimestamp },
) {
  if (!payment?.displayStatus) return false;
  const providerUpdatedAt =
    payment.updatedAt || payment.createdAt || eventTimestamp;
  if (
    !(providerUpdatedAt instanceof Date) ||
    !Number.isFinite(providerUpdatedAt.getTime())
  ) {
    throw billingDatabaseError(
      "A verified provider timestamp is required for payment evidence.",
      "BILLING_PAYMENT_TIMESTAMP_INVALID",
    );
  }
  const result = await client.query(
    `INSERT INTO billing_payment_history (
       provider_mode, provider_payment_id, clerk_user_id,
       provider_membership_id, provider_checkout_id, company_id,
       product_id, plan_id, plan_code, display_status,
       provider_substatus, settlement_amount, currency, tax_amount,
       tax_behavior, billing_reason, paid_at, provider_created_at,
       provider_updated_at, refunded_at, disputed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19, $20, $21
     )
     ON CONFLICT (provider_mode, provider_payment_id) DO UPDATE SET
       provider_membership_id = COALESCE(
         billing_payment_history.provider_membership_id,
         EXCLUDED.provider_membership_id
       ),
       provider_checkout_id = COALESCE(
         billing_payment_history.provider_checkout_id,
         EXCLUDED.provider_checkout_id
       ),
       company_id = COALESCE(
         billing_payment_history.company_id,
         EXCLUDED.company_id
       ),
       product_id = COALESCE(
         billing_payment_history.product_id,
         EXCLUDED.product_id
       ),
       plan_id = COALESCE(
         billing_payment_history.plan_id,
         EXCLUDED.plan_id
       ),
       display_status = EXCLUDED.display_status,
       provider_substatus = EXCLUDED.provider_substatus,
       settlement_amount = COALESCE(
         EXCLUDED.settlement_amount,
         billing_payment_history.settlement_amount
       ),
       currency = COALESCE(EXCLUDED.currency, billing_payment_history.currency),
       tax_amount = COALESCE(
         EXCLUDED.tax_amount,
         billing_payment_history.tax_amount
       ),
       tax_behavior = COALESCE(
         EXCLUDED.tax_behavior,
         billing_payment_history.tax_behavior
       ),
       billing_reason = COALESCE(
         EXCLUDED.billing_reason,
         billing_payment_history.billing_reason
       ),
       paid_at = COALESCE(
         billing_payment_history.paid_at,
         EXCLUDED.paid_at
       ),
       refunded_at = COALESCE(
         billing_payment_history.refunded_at,
         EXCLUDED.refunded_at
       ),
       disputed_at = COALESCE(
         billing_payment_history.disputed_at,
         EXCLUDED.disputed_at
       ),
       provider_updated_at = EXCLUDED.provider_updated_at,
       updated_at = now()
     WHERE billing_payment_history.clerk_user_id = EXCLUDED.clerk_user_id
       AND billing_payment_history.plan_code = EXCLUDED.plan_code
       AND (
         billing_payment_history.provider_membership_id IS NULL OR
         EXCLUDED.provider_membership_id IS NULL OR
         billing_payment_history.provider_membership_id =
           EXCLUDED.provider_membership_id
       )
       AND (
         billing_payment_history.provider_checkout_id IS NULL OR
         EXCLUDED.provider_checkout_id IS NULL OR
         billing_payment_history.provider_checkout_id = EXCLUDED.provider_checkout_id
       )
       AND (
         billing_payment_history.company_id IS NULL OR
         billing_payment_history.company_id = EXCLUDED.company_id
       )
       AND (
         billing_payment_history.product_id IS NULL OR
         billing_payment_history.product_id = EXCLUDED.product_id
       )
       AND (
         billing_payment_history.plan_id IS NULL OR
         billing_payment_history.plan_id = EXCLUDED.plan_id
       )
       AND billing_payment_history.provider_updated_at <= EXCLUDED.provider_updated_at
     RETURNING clerk_user_id`,
    [
      providerMode,
      payment.id,
      userId,
      payment.membershipId,
      payment.checkoutConfigurationId,
      payment.companyId,
      payment.productId,
      payment.planId,
      payment.planCode,
      payment.displayStatus,
      payment.substatus,
      payment.settlementAmount,
      payment.currency,
      payment.taxAmount,
      payment.taxBehavior,
      payment.billingReason,
      payment.paidAt,
      payment.createdAt,
      providerUpdatedAt,
      payment.refundedAt,
      payment.disputedAt,
    ],
  );
  if (result.rowCount === 1) return true;

  const existing = await client.query(
    `SELECT clerk_user_id, plan_code, provider_membership_id,
            provider_checkout_id, company_id, product_id, plan_id,
            provider_updated_at
     FROM billing_payment_history
     WHERE provider_mode = $1 AND provider_payment_id = $2`,
    [providerMode, payment.id],
  );
  const row = existing.rows[0];
  if (
    row &&
    row.clerk_user_id === userId &&
    row.plan_code === payment.planCode &&
    nullableIdMatches(row.provider_membership_id, payment.membershipId) &&
    nullableIdMatches(
      row.provider_checkout_id,
      payment.checkoutConfigurationId,
    ) &&
    nullableIdMatches(row.company_id, payment.companyId) &&
    nullableIdMatches(row.product_id, payment.productId) &&
    nullableIdMatches(row.plan_id, payment.planId)
  ) {
    return false;
  }
  throw billingConflict(
    "A Whop payment attempted to change account ownership.",
    "PAYMENT_MAPPING_CONFLICT",
  );
}

function nullableIdMatches(existing, next) {
  return !existing || !next || existing === next;
}

async function enforceDistributedAnalysisAdmission(client, {
  globalConcurrentReservationLimit,
  globalStartsPerMinuteLimit,
  reservationTtlMs,
}) {
  // Every API instance connected to this database takes the same short-lived
  // transaction lock before it creates a reservation. This turns the existing
  // billing reservation table into an atomic, cross-instance admission gate
  // without persisting screenshots, prompts, or model responses.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    ["zenaian:analysis-admission:v1"],
  );
  const result = await client.query(
    `SELECT count(*)::integer AS active
     FROM billing_analysis_usage
     WHERE state = 'reserved'
       AND created_at >= now() - ($1::bigint * interval '1 millisecond')`,
    [reservationTtlMs],
  );
  const active = Number(result.rows[0]?.active) || 0;
  if (active >= globalConcurrentReservationLimit) {
    throw distributedAdmissionError(
      "The analysis service is at its shared capacity. Please try again shortly.",
      "ANALYSIS_GLOBAL_CAPACITY_REACHED",
      1,
    );
  }

  // A synthetic, non-user usage-period row is the durable minute bucket. Its
  // existing unique key makes this update atomic and indexed without adding a
  // new production migration. Normal retention cleanup removes expired buckets.
  const starts = await client.query(
    `WITH admitted AS (
       INSERT INTO billing_usage_periods (
         id, clerk_user_id, period_key, plan_id, allowance, consumed,
         starts_at, ends_at
       ) VALUES (
         $1, '__zenaian_global_admission__',
         'global-analysis:' ||
           floor(extract(epoch FROM current_timestamp) / 60)::bigint::text,
         'ultra', $2, 1,
         date_trunc('minute', current_timestamp),
         date_trunc('minute', current_timestamp) + interval '1 minute'
       )
       ON CONFLICT (clerk_user_id, period_key)
       DO UPDATE SET
         allowance = EXCLUDED.allowance,
         consumed = billing_usage_periods.consumed + 1,
         updated_at = current_timestamp
       WHERE billing_usage_periods.consumed < EXCLUDED.allowance
       RETURNING consumed
     )
     SELECT EXISTS(SELECT 1 FROM admitted) AS admitted,
            GREATEST(
              1,
              ceil(extract(epoch FROM (
                date_trunc('minute', current_timestamp) + interval '1 minute' -
                current_timestamp
              )))::integer
            ) AS retry_after_seconds`,
    [randomUUID(), globalStartsPerMinuteLimit],
  );
  if (!starts.rows[0]?.admitted) {
    throw distributedAdmissionError(
      "The analysis service has reached its shared start-rate limit. Please try again shortly.",
      "ANALYSIS_GLOBAL_RATE_LIMITED",
      Number(starts.rows[0]?.retry_after_seconds) || 60,
    );
  }
}

function distributedAdmissionError(message, code, retryAfterSeconds) {
  return Object.assign(new Error(message), {
    status: 429,
    code,
    retryAfterSeconds,
  });
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

function accountDeletionInProgress() {
  return Object.assign(
    new Error("This account is unavailable because deletion was requested."),
    { status: 403, code: "ACCOUNT_DELETION_IN_PROGRESS" },
  );
}

function billingDatabaseError(message, code = "BILLING_DATABASE_UNAVAILABLE") {
  return Object.assign(new Error(message), { status: 503, code });
}

function normalizeDatabaseError(error) {
  if (
    error?.code === "P0001" &&
    String(error?.message || "").includes("ACCOUNT_DELETION_IN_PROGRESS")
  ) {
    return accountDeletionInProgress();
  }
  if (
    error?.code === "P0001" &&
    String(error?.message || "").includes("PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT")
  ) {
    return billingDatabaseError(
      "The statutory billing archive rejected an inconsistent provider mapping.",
      "BILLING_LEGAL_ARCHIVE_CONFLICT",
    );
  }
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
