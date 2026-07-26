# Deployment guide

1. Back up the current repository `website` folder.
2. Delete the old `website` folder from the repository.
3. Upload the complete replacement `website` folder from this package.
4. Confirm that `.env.local`, `node_modules`, and `.next` were not uploaded.
5. Commit the changes to the branch used by Render.
6. Keep Render configured with:
   - Root Directory: `website`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
7. Verify the homepage, `/account`, `/pricing`, `/affiliate`, and `/privacy`.

Rollback by restoring the backed-up folder and committing again.
