# SnapGrok website

The promotional landing page plus Clerk-hosted sign-in, sign-up, sign-out, and
account management surfaces for SnapGrok v4.

## Routes

- `/` — promotional landing page
- `/account?mode=sign-in` — primary Clerk sign-in gateway
- `/account?mode=sign-up` — primary Clerk registration gateway
- `/account` — signed-in profile, security settings, and account overview
- `/sign-in` and `/sign-up` — compatible direct authentication routes

Signed-out visitors see separate **Log in** and **Sign up** actions in the site
header. Signed-in visitors see their name and avatar; its menu includes
**Manage account** and **Sign out**.

## Local development

Requirements: Node.js 22.13 or newer and npm.

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the development Clerk key.
3. Run `npm ci` and `npm run dev`.
4. Open `http://localhost:3000`.

On Windows PowerShell, use `npm.cmd` if PowerShell blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run dev
```

The Clerk secret key does not belong in this frontend project.

## Production

Set the production Clerk publishable key and the final HTTPS website origin as
hosting environment variables, then deploy the repository through Sites or a
compatible Cloudflare Worker build target. Use a Clerk production instance for
the public website and Chrome Web Store extension.

The site includes `.openai/hosting.json`, so Sites is the supported hosted path.
Its build artifact is produced by `npm run build` and validated with
`npm run validate:artifact`.

## Checks

- `npm run build` — build and validate the Worker artifact
- `npm run validate:artifact` — validate an existing artifact
- `npm test` — build and test rendered metadata

The v0.2.0 scripts work on Windows, macOS, Linux, and the Sites builder.
