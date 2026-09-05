# Zenaian deployment: step by step

Deploy in this order:

1. Database
2. API server
3. Website
4. Chrome extension

If a component did not change, you can skip its deployment. Always make sure
the API is healthy before deploying the website.

## Step 1: Test locally

Use Node `22.13.1`. From the repository root, run:

```powershell
cd server
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
npm.cmd audit --omit=dev --audit-level=low

cd ..\website
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd audit --omit=dev --audit-level=low
```

Stop if any command fails. Never use the production database for tests.

## Step 2: Prepare the release commit

1. Run `git status` and review the changed files.
2. Commit only the intended changes. Never commit `.env` files or secrets.
3. Do not push yet. The database release must finish before Render can deploy
   the new API code.

## Step 3: Update and verify both databases

Run database commands from a trusted migration environment, not from the
long-running Render API service.

Set both databases' short-lived DDL-owner URLs, restricted runtime URLs and
runtime roles, plus the deletion-ledger encryption keyring, as described in
[`server/README.md`](../server/README.md). Then run the single ordered release
command:

```powershell
cd server
npm.cmd run release:databases
```

This migrates and verifies the external deletion ledger first, then the main
database. Continue only when it ends with:

```json
{"operation":"release_databases","ready":true}
```

For the first release only, `MIGRATION_BOOTSTRAP_RUNTIME_ROLES=true` can create
the two restricted PostgreSQL login roles from the passwords in their runtime
URLs. Remove that flag and both migration-owner URLs after the successful gate.
If the gate ran as the API service's Render pre-deploy command, clear the
command and redeploy the same commit once more after removing those temporary
values, so the steady-state process contains runtime credentials only.

The main-database preflight must also report these values as `true`:

- `privacyMigrationApplied`
- `runtimeSafetyMigrationApplied`
- `privacyTablesPresent`
- `privacyRuntimeReady`
- `safeToApplyPrivacyMigration`
- `safeForConfiguredBillingMode`

Never retain either migration/DDL-owner database URL on the Render API service.
For restore/replay or controlled ledger-retention operations, follow
[`PRIVACY_RECOVERY_RUNBOOK.md`](../server/PRIVACY_RECOVERY_RUNBOOK.md).

## Step 4: Push and deploy the API server

Push the verified release commit to the branch connected to Render. Automatic
deploy is safe only now that both database release checks have passed.

Use these Render settings:

```text
Root Directory: server
Build Command: npm ci --ignore-scripts
Start Command: npm start
Health Check Path: /api/live
Node version: 22.13.1
```

Keep the existing server environment variables and deploy the latest commit.
When Render says the service is live, open:

`https://snapgrok-api.onrender.com/api/health`

Check that:

- the version matches `server/package.json`
- `privacyControls` is `true`
- `privacyReady` is `true`
- `maintenance.status` is `healthy`
- the deletion backlog is not overdue
- the ZDR safety latch is enabled

Stop here if the API is unhealthy.

## Step 5: Deploy the website

Use these Render settings:

```text
Root Directory: website
Build Command: npm ci --ignore-scripts && npm run build
Start Command: npm start
Health Check Path: /api/health
Node version: 22.13.1
```

Set these public environment variables:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuemVuYWlhbi5jb20k
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=https://clerk.zenaian.com
NEXT_PUBLIC_SITE_URL=https://www.zenaian.com
NEXT_PUBLIC_API_URL=https://snapgrok-api.onrender.com
NEXT_PUBLIC_EXTENSION_ID=jjgjlopdpefphgappfmkkkpiknpnoijb
```

Do not add server secrets to the website. Deploy, open
`https://www.zenaian.com`, and hard-refresh the page.

## Step 6: Publish the extension

Skip this step if the extension did not change.

1. Confirm `extension/auth-config.js` contains the production website and API.
2. Increase the version in `extension/manifest.json`.
3. Zip the contents of `extension`; `manifest.json` must be at the ZIP root.
4. Upload the ZIP to the Chrome Web Store.
5. Delete the temporary ZIP after uploading it.

## Step 7: Smoke-test production

Use disposable accounts for payment and deletion tests.

1. While signed out, confirm **Sign up** and **Log in** are visible.
2. Sign in and confirm the account and subscription details load.
3. Complete Clerk re-verification, open **View my data**, and use **Download
   file**. Confirm the summary describes the downloaded user's records.
4. Start a subscription checkout with a disposable account.
5. Delete a different disposable account. Confirm the receipt appears and the
   user is signed out.
6. Pair the extension, check its hover message, and run one analysis.
7. Check Render logs for unexpected `5xx`, CSP, webhook, or maintenance errors.

The deployment is complete when every smoke test passes.

## If deployment fails

Stop before deploying the next component. You may roll back application code,
but do not undo database migrations manually. For a database restore, follow
[`PRIVACY_RECOVERY_RUNBOOK.md`](../server/PRIVACY_RECOVERY_RUNBOOK.md) before
reopening traffic.
