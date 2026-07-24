# SneakSolve V5 invariants

- Preserve the V3.9 capture and result behavior.
- Keep long xAI requests in the transient offscreen document.
- Keep one-operation-at-a-time locking until the result icon resets.
- Keep notifications disabled.
- Do not persist screenshots, instructions, answers, tokens, or server payloads.
- Keep legacy internal storage keys and message names for upgrade compatibility.
- Require a fresh Clerk token before capture; the API remains authoritative.
