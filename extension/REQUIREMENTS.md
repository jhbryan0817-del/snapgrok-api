# SneakSolve v5.1.6 invariants

- Preserve the V3.9 capture and result behavior.
- Keep long xAI requests in the transient offscreen document.
- Keep one-operation-at-a-time locking until the result icon resets.
- Keep notifications disabled.
- Do not persist screenshots, instructions, answers, tokens, or server payloads.
- Keep legacy storage and capture-result messages for upgrade compatibility.
- Version the selector-control handshake so an open tab cannot reuse a stale
  dynamically injected listener after an extension update.
- Treat the production Sync Host cookie as the client session source of truth.
- Require a fresh Clerk token before capture; the API remains authoritative.
- Allow only the canonical production website to request the read-only
  extension-installation ping; never expose auth, settings, storage, or capture
  actions through external messages.
