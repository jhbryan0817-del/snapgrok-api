# Offer and support record operations

## Versioned offer snapshots

Before any pricing, allowance, renewal, tax, checkout, withdrawal, or refund
copy reaches production:

1. Add a JSON snapshot under `compliance/offer-snapshots/` using the UTC release
   date and website version in the filename.
2. Capture every displayed plan price/cadence/allowance/model, the deployed
   Terms and Privacy versions, and the exact Whop Additional Terms/Return
   Policy revision.
3. Review the live checkout against the snapshot and attach a dated screenshot
   to the private release evidence bundle. Do not store buyer information in
   the screenshot.
4. Commit the snapshot with the release. Retain it for at least six months
   after the offer stops being displayed; do not rewrite an existing snapshot.

The current baseline is
`compliance/offer-snapshots/2026-08-16-v6.15.0.json`.

## Minimized support and complaint archive

Use the controlled support/privacy mailbox and create a case record only when
a message is a purchase complaint, withdrawal/refund request, dispute, or
material service complaint. Store only: a random case ID, category, received
and resolved dates, purchase email or provider transaction ID when necessary,
the requested resolution, the outcome, and a short factual chronology.

Do not copy full card data, passwords, access tokens, screenshots submitted for
AI analysis, unrelated message history, or unnecessary identity documents into
the archive. Redact accidental sensitive content promptly. Keep access limited
to assigned operators with 2-Step Verification and no forwarding.

Retain the minimized complaint/dispute record for the legally approved period
(the current product policy uses three years), then delete it. Ordinary support
messages that do not become complaint evidence follow the mailbox's shorter
365-day deletion rule. Record legal holds separately and remove them when the
hold ends.
