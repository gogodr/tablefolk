# Operations

## Environment and release order

Use separate PostgreSQL databases and service settings for development, preview, and production. The API uses `DATABASE_URL` (or `DATABASE_URL_POOLED`) for requests and `DIRECT_URL` or Neon’s `DATABASE_URL_UNPOOLED` for Prisma migrations. Keep BGG, Resend, Clerk secret, and database credentials out of the web bundle. Set the web's `NEXT_PUBLIC_API_URL` and the API's `WEB_ORIGIN`/`PUBLIC_WEB_URL` to their matching deployment URLs.

The Vercel Preview projects are `gogodr/tablefolk-api` and `gogodr/tablefolk-web`. The API Preview has its own Neon database. Stable preview aliases are `tablefolk-api-preview-gogodr.vercel.app` and `tablefolk-web-preview-gogodr.vercel.app`; after each successful CLI preview deployment, move the matching alias to the new deployment URL with `vercel alias set`. Use those stable addresses for the cross-project environment variables and invitation links. The web Preview retains Vercel Authentication; the API project does not, so the browser can reach its Clerk-protected routes.

Run `corepack pnpm --filter @tablefolk/api db:deploy` against the target database before promoting a release that requires the new schema. Then deploy the API and web projects. Review migration SQL before production use. Do not run migrations automatically on every preview build.

## Common failures

- BGG search or import errors affect adding games. Existing collections, group views, and game night draws continue from stored data.
- Failed cover copying leaves a local placeholder; it does not block adding a game.
- A failed invitation email is marked `SEND_FAILED`; the creator can resend, which rotates its token. Only a verified account email matching the invitation can accept it.
- If the API cannot connect to PostgreSQL, check the pooler URL, credentials, and schema migration status. The `/health` route confirms the process is up, but it does not validate the database.
- The API logs structured event names for group changes and picks without logging invitation tokens or BGG credentials. Review Vercel runtime logs for errors.

## Rollback and credentials

Redeploy the previous compatible API and web versions for a code rollback. Preserve columns that an older version still needs until all environments have moved forward. For a compromised key, rotate it at its provider and update only the projects that use it. Rotate invitation tokens by resending invitations; previous links then stop working.

Before public launch, confirm the BGG application's approved license covers stored game details and cover display, test Clerk's email/password and Google paths, verify the Resend domain, and complete a real invitation and game-night journey.
