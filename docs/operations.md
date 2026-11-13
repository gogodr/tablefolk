# Operations

## Environment and release order

Use separate PostgreSQL databases and service settings for development, preview, and production. The API uses `DATABASE_URL` (or `DATABASE_URL_POOLED`) for requests and `DIRECT_URL` or Neon’s `DATABASE_URL_UNPOOLED` for Prisma migrations. Keep BGG, Resend, Clerk secret, and database credentials out of the web bundle. Set the web's `NEXT_PUBLIC_API_URL` and the API's `WEB_ORIGIN`/`PUBLIC_WEB_URL` to their matching deployment URLs.

The Vercel Preview projects are `gogodr/tablefolk-api` and `gogodr/tablefolk-web`. The API Preview has its own Neon database. Stable preview aliases are `tablefolk-api-preview-gogodr.vercel.app` and `tablefolk-web-preview-gogodr.vercel.app`; after each successful CLI preview deployment, move the matching alias to the new deployment URL with `vercel alias set`. Use those stable addresses for the cross-project environment variables and invitation links. The web Preview retains Vercel Authentication; the API project does not, so the browser can reach its Clerk-protected routes.

Run `corepack pnpm --filter @tablefolk/api db:deploy` against the target database before promoting a release that requires the new schema. Then deploy the API and web projects. Review migration SQL before production use. Do not run migrations automatically on every preview build.

## GitHub deployment workflow

The workflow in `.github/workflows/vercel-deploy.yml` deploys both Vercel projects. Add these secrets and variables to the GitHub `Prod` environment before enabling it:

| Setting | Value |
| --- | --- |
| Secret `VERCEL_API_TOKEN` | Project-scoped Vercel token for `tablefolk-api`; needs deployment and alias access |
| Secret `VERCEL_WEB_TOKEN` | Project-scoped Vercel token for `tablefolk-web`; needs deployment and alias access |
| Variable `VERCEL_ORG_ID` | Vercel team ID (`team_...`) |
| Variable `VERCEL_TEAM_SLUG` | The team's Vercel URL slug (for this repo, `gogodr`) |
| Variable `VERCEL_API_PROJECT_ID` | ID of the `tablefolk-api` project (`prj_...`) |
| Variable `VERCEL_WEB_PROJECT_ID` | ID of the `tablefolk-web` project (`prj_...`) |

The workflow accepts a separate project-scoped token for each project. It uses Vercel's REST API because the Vercel CLI performs user and team lookups that can fail with project-scoped tokens. The token for each project is used only for that project's deployment, alias assignment, and cleanup. The GitHub job still checks each token against its expected Vercel project before deploying.

Both `/deploy` previews and merged-PR production deployments use the `Prod` GitHub environment to read these credentials. Any approval or branch rules configured on that environment apply to both events. GitHub's environment name does not select the Vercel deployment target; the workflow sends previews to Vercel Preview and merge commits to Vercel Production.

Keep both projects' root directories set to `apps/api` and `apps/web` and enable access to files outside those directories for the shared workspace package. Set Preview and Production environment variables separately in Vercel, including separate databases. The workflow overrides only the three cross-project URLs for each PR preview. The API and web projects must be on the same Vercel team. The team must be able to claim `tablefolk-api-pr-N-gogodr.vercel.app` and `tablefolk-web-pr-N-gogodr.vercel.app` aliases, where `N` is a PR number. If the team slug differs, the workflow uses `VERCEL_TEAM_SLUG` in place of `gogodr`.

Once the workflow file is on `main`, a repository collaborator with write access can comment exactly `/deploy` on an open same-repository PR targeting `main`. The workflow reacts to the command with 👀, deploys that PR's current commit, assigns stable per-PR API and web aliases, and posts a success comment with both links. If deployment fails, it posts a failure comment with a redacted stack trace and a link to the workflow logs. Comment `/deploy` again after pushing more commits to refresh the preview. Fork PRs are deliberately excluded because deployment builds receive Preview environment credentials. The workflow runs the orchestration script from `main`, never from the PR checkout.

The job requests `pull-requests: write` as well as `issues: write`. GitHub checks PR conversation comments and reactions against the pull-request permission even though their REST paths use `/issues`. A reaction failure is logged but does not stop the deployment.

If Vercel returns HTTP 429 while creating a deployment, the workflow retries for up to five minutes per project, using `Retry-After` or `X-RateLimit-Reset` when supplied. If the limit persists, it posts the failure on the PR; retry `/deploy` after the quota resets.

Merging a PR into `main` deploys the merge commit to both Production projects. After both deploys succeed, the workflow removes the two PR preview deployments and updates its PR comment. A failed production deployment leaves the preview available for investigation. Schema migrations remain a separate release step. If Vercel's Git integration is also set to deploy every push, disable those automatic deployments for these two projects to avoid duplicate Preview and Production builds.

## Common failures

- BGG search or import errors affect adding games. Existing collections, group views, and game night draws continue from stored data.
- Failed cover copying leaves a local placeholder; it does not block adding a game.
- A failed invitation email is marked `SEND_FAILED`; the creator can resend, which rotates its token. Only a verified account email matching the invitation can accept it.
- If the API cannot connect to PostgreSQL, check the pooler URL, credentials, and schema migration status. The `/health` route confirms the process is up, but it does not validate the database.
- The API logs structured event names for group changes and picks without logging invitation tokens or BGG credentials. Review Vercel runtime logs for errors.

## Rollback and credentials

Redeploy the previous compatible API and web versions for a code rollback. Preserve columns that an older version still needs until all environments have moved forward. For a compromised key, rotate it at its provider and update only the projects that use it. Rotate invitation tokens by resending invitations; previous links then stop working.

Before public launch, confirm the BGG application's approved license covers stored game details and cover display, test Clerk's email/password and Google paths, verify the Resend domain, and complete a real invitation and game-night journey.
