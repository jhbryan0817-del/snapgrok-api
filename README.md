# SnapGrok API — no persistent request storage

This is the Render-ready backend for the SnapGrok Chrome extension with the
request-storage feature removed completely.

## Storage behavior

The server does **not** contain `data-store.js`, a data directory, database
code, a save switch, a clear-data endpoint, or any route that can persist a
screenshot, prompt, response, page URL, page title, or token-usage record.

For each `/api/analyze` request:

1. The screenshot and instruction arrive in process memory.
2. They are sent to xAI with `store: false`.
3. The result is returned directly to the extension.
4. The server releases its references to the request content after completion.

Like any network service, transient copies necessarily exist in RAM and in the
network request while processing occurs. This project does not write that
content to files or a database. It also does not print request bodies to logs.

## Repository structure

```text
snapgrok-api-no-storage/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── src/
    ├── env.js
    ├── server.js
    └── xai.js
```

## Render settings

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Root directory: blank, provided `package.json` is at the repository root

Store the real `XAI_API_KEY` in Render under **Environment**, not in GitHub.

## Replacing the previous repository version

Delete the old `src/data-store.js` file and replace the other repository files
with the files in this folder. Commit and push. Render should redeploy
automatically.

The previous `DELETE /api/data` endpoint no longer exists because there is
nothing for it to delete.
