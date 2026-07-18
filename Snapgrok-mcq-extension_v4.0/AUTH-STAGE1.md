# SnapGrok v4.0 account preparation

This release prepares the website-based account experience without pretending that Clerk is already active.

## Working now

- Existing v3.9 full-tab and selected-zone capture logic remains unchanged.
- The extension popup includes Sign in, Create account, Manage account, and Sign out positions.
- Sign in opens the website `/extension-login` page in a separate Chrome popup window.
- Create account opens the website `/sign-up` page.
- Website dashboard opens from the extension.
- The website contains complete placeholder pages and responsive styling.

## Intentionally inactive

- No user is considered authenticated.
- Sign out is inactive because there is no Clerk session yet.
- The backend is not protected by a Clerk token yet.
- Keyboard shortcuts still work without login until Clerk is integrated.

## Files designed for replacement later

- `auth-config.js`: change the website URL after deployment.
- `auth-bridge.js`: replace the placeholder methods with Clerk session methods.
- `service-worker.js`: later request a fresh Clerk token before capture and API calls.
- `offscreen.js`: later attach `Authorization: Bearer <token>` to `/api/analyze`.
- Backend `src/server.js`: later verify the Clerk token before calling xAI.

Never use the popup's visual account state as backend authorization.
