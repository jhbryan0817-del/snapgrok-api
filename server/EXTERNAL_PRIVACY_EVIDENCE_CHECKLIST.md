# External privacy release evidence

Repository code cannot prove vendor-dashboard or mailbox configuration. The
release owner must attach dated screenshots or exported settings for every
item below. A blank item blocks production release; do not replace evidence
with an assertion in source code.

- [ ] xAI team shows Zero Data Retention active; evidence date and reviewer are recorded.
- [ ] Whop has the current Terms, Privacy Policy, and withdrawal/refund terms uploaded, with mandatory acceptance enabled.
- [ ] A real checkout shows the complete Korean price, renewal, immediate-supply, withdrawal, non-conformity, and refund disclosures before payment.
- [ ] Google Workspace privacy mailbox has 2-Step Verification, no forwarding, the approved data region/at-rest setting, and the 365-day mailbox deletion rule.
- [ ] Hosting.kr analytics and raw-log archiving are disabled.
- [ ] Render log/recovery settings and distinct runtime/migration database roles are captured.
- [ ] The external deletion ledger is on a separate restore boundary and its runtime role has only `SELECT`/`INSERT`.
- [ ] Chrome Web Store privacy disclosures match the shipped extension behavior and permissions.
- [ ] The xAI ZDR latch is enabled and `/api/health` reports healthy maintenance with no due deletion retries.

For each checked item, record the evidence location, UTC capture date,
reviewer, production workspace/account, and next review date. Keep secrets,
tokens, full customer identifiers, and card data out of the evidence bundle.
