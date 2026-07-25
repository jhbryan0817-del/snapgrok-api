# SneakSolve v5.1.0 invariants

- Preserve the V3.9 capture and result behavior.
- Keep long xAI requests in the transient offscreen document.
- Keep one-operation-at-a-time locking until the result icon resets.
- Keep notifications disabled.
- Do not persist screenshots, instructions, answers, tokens, or server payloads.
- Keep legacy internal storage keys and message names for upgrade compatibility.
- Treat the production Sync Host cookie as the client session source of truth.
- Require a fresh Clerk token before capture; the API remains authoritative.
