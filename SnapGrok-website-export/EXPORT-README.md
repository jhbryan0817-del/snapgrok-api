# SnapGrok Website Export

This package contains the complete editable source and the compiled production output for the SnapGrok landing page.

## Folder contents

### `editable-source/`

The maintainable website project:

- `app/page.tsx` — complete page markup, content, navigation, and hoverable multiple-answer demonstration.
- `app/globals.css` — complete visual design, responsive layout, animations, and interaction styles.
- `app/layout.tsx` — document metadata, fonts, and global page shell.
- `public/snapgrok-icons/` — every SnapGrok visual icon used by the page.
- `package.json` and `package-lock.json` — exact framework and package versions.
- `vite.config.ts`, `next.config.ts`, `postcss.config.mjs`, and `tsconfig.json` — build configuration.
- `build/`, `scripts/`, `worker/`, and `tests/` — build, deployment-runtime, and validation files.

The site uses React with TypeScript/TSX. TSX supplies the HTML structure and is compiled into browser JavaScript, so the editable project does not use a separate hand-written `index.html` file.

### `production-build/`

The already-compiled production bundle:

- `client/` — browser JavaScript, generated CSS, and all public visual assets.
- `server/` — the production server/worker JavaScript bundle and manifests.

Build filenames inside this folder are content-hashed and should not be renamed individually.

## Run the editable project

Requirements:

- Node.js 22.13 or newer
- npm

From `editable-source/`:

```bash
npm ci
npm run dev
```

For a fresh production build:

```bash
npm run build
```

The build output is written to `dist/`.

## Exporting to another host

Use `editable-source/` when importing into a Git repository or another platform that can build Node.js/React applications. The included production output targets a server/worker deployment rather than a double-clickable static HTML file.

Deployment-specific project identity, credentials, dependency caches, and source-control history have intentionally been excluded from this export.
