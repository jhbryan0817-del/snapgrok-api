# V3.9 requirements

- Preserve all V3.8.2 behavior and UI.
- Continue using snapgrok-api_v2 unchanged.
- Allow slower xAI responses without a 27-second client abort.
- Do not run the long fetch directly in the Manifest V3 service worker.
- Keep one-operation-at-a-time locking until the result icon resets.
- Keep notifications disabled.
- Do not persist screenshots, instructions, answers, or server payloads.
