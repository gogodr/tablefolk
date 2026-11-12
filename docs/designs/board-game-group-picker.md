# Board Game Group Picker

* **Author:** Gogod
* **Status:** Proposed
* **Date:** 2026-11-11

## Overview

This web app helps a board game group choose what to play. Members keep personal game collections and share selected games with a group. The group sees one entry per game and the members who shared it. For game night, a member enters the number of people attending and receives a random suggestion from shared games whose stored player range includes that number.

BoardGameGeek (BGG) supplies information only when a user searches for and adds a game. The app stores the selected game's information and uses its own data for regular collection, group, and picker operations. The interface should feel friendly and board-game themed, with meeple details and original illustrations where they help people use the app.

## The Problem

Choosing a game for game night is difficult when the group's games are spread across individual collections. People need to know which games the group can draw from, who shared each one, and which titles support the number of people attending. Without a shared view and a player-count filter, choosing falls back to manually comparing collections and game boxes.

The app reduces that work to a shared collection and a draw. A draw is a suggestion, not a promise that a sharing member can bring the game. The group can draw again if needed. Expansions are treated as complete game entries for drawing, even though a selected expansion may need a base game to play.

## Goals

- A user can find a base game or expansion through BGG, add it to a personal collection, and use the stored details afterward without another BGG request.
- A group creator can invite people by email and manage membership. Members can share or unshare games from their personal collections.
- A group member can see each shared BGG game once, together with every current member who shares it.
- A group member can enter a positive whole-number headcount and draw a shared game whose stored minimum and maximum player counts include that number, then draw again if needed.
- If no shared game supports the headcount, the app explains that no single game fits and suggests splitting the party into multiple groups. An empty group collection has its own message.
- The interface uses a friendly board-game identity with meeple motifs, readable game information, and useful illustrations on small and large screens.

## Non-Goals

- Confirming that an owner can bring a game to a particular game night.
- Checking whether an expansion requires a base game before it can be drawn.
- Splitting attendees into groups or choosing several games automatically.
- Scheduling game nights or tracking plays, ratings, or payments.
- Importing or synchronizing a user's entire BGG collection.
- Calling BGG during ordinary collection browsing, group use, or game night draws.

## Open Questions

- Confirm that the approved BGG application license covers the app's intended public use and the planned storage and display of game text and covers before launch. This is an external approval, not a change to the picker or collection rules.

## Critical User Journeys

### Add and share a game

* **Given:** A signed-in member belongs to a group.
* **When:** They search BGG, choose a game, add it to their personal collection, and share it with the group.
* **Then:** The app stores the selected details locally. The game appears once in the group collection, with that member listed among its sharing owners. Later group views do not call BGG.

### Draw a game for game night

* **Given:** A group has shared games with stored player ranges.
* **When:** A member enters a positive whole-number headcount and asks the app to pick a game.
* **Then:** The app chooses from group games whose stored range includes the headcount and shows the game and its sharing members. If none qualify, it shows the agreed no-match message. The member can draw again.

### Remove a share

* **Given:** Two members share the same BGG game with a group.
* **When:** One member stops sharing that game or leaves the group.
* **Then:** That member disappears from the sharing-owner list, but the game remains in the group collection and picker because another share remains.

## Technical Plan

The system has a Next.js web app, a separate Fastify TypeScript API, a PostgreSQL database, and Clerk for sign-in. Clerk supports email/password accounts and Google sign-in. The web app renders collection, group, invitation, and picker screens. It calls the API for all user and group actions. The API verifies Clerk identity, checks group membership in PostgreSQL, reads and writes application data, and sends invitations through Resend. Only the API holds `BGG_TOKEN` and calls BGG, and it does so only while a user searches for or adds a game. Clerk does not own game groups or their invitations. The web app and API are separate Vercel deployments.

```text
Browser
  |
  v
Next.js web app  --->  Fastify API    --->  PostgreSQL
      |                       |
      v                       v
    Clerk               Clerk token verification
                              |
                              +----------> BGG XML API2
                                   (search and add only)
                              |
                              +----------> PostgreSQL cover bytes
                                   (cover import only)
                              |
                              +----------> Resend
                                   (group invitations)
```

### Stored data and ownership

- **Game:** One record per BGG ID, with the selected BGG title, item type, player range, app-hosted cover reference, and other display details captured when first added. BGG ID is the identity used to combine the same game across members. Expansion status is stored for display but does not restrict drawing.
- **Personal collection:** A link between a user and a stored game. A user cannot add the same BGG game to their own collection twice.
- **Group:** A group name, creator, and membership records stored in PostgreSQL. The creator can invite and remove members. Clerk provides identity only, not group membership.
- **Group share:** A link between a current group member and one of that member's personal collection games. The group collection is a query over active shares, grouped by BGG ID. It is not a second editable copy.
- **Invitation:** A group, invitee email, inviter, token or equivalent acceptance proof, status, and expiry stored in PostgreSQL. The creator can see pending invitations and revoke them. The API sends invitation emails through Resend.

Removing a share deletes only that member's group link. Removing a member removes that member's shares in the group. Removing a game from a personal collection also removes that member's shares of it from every group. A group game remains while at least one active share remains. These actions run in database transactions so the owner list and picker cannot disagree after a successful change. The personal collection UI explains the sharing effect before removal.

### BGG import boundary

The API uses BGG XML API2 search to return candidate games during an add flow. When a user selects a candidate, the API requests its details, validates the BGG ID and item type, copies an allowed cover image into PostgreSQL, and stores a local game record or reuses one already stored. It then adds the user's personal collection link. Subsequent collection views and draws read only PostgreSQL and app-hosted images. The app does not schedule BGG refreshes. Search and import requests are rate limited, and a BGG error is shown only in the add flow. The public interface includes the linked BGG attribution required by BGG's published API guidance.

### API boundaries and picker

The API verifies Clerk sessions and exposes operations for personal collection search and changes, groups and membership, invitations, shares, and game-night picks. Every group read or write checks active membership. Invitation and member-removal operations require the group creator. A member may share or unshare only their own collection entries.

For a pick, the API validates the headcount as a positive whole number, queries distinct shared BGG games in the group whose stored minimum is at most the headcount and maximum is at least the headcount, then selects one candidate at random. Expansions use the same range rule as base games. The response includes the selected game and current sharing members. If the group has no shares, it returns an empty-collection result. If shares exist but none qualify, it returns a no-match result and the split-party suggestion. No BGG request occurs in this path.

### Visual interface

The Next.js app uses a warm tabletop visual language, meeple motifs, game covers, and original illustrations for welcome, invitation, empty, and draw states. Game cards make title, player range, expansion type, and sharing members clear. The draw result identifies an expansion and provides another-draw control. The interface supports mobile layouts, keyboard navigation, readable contrast, and reduced motion.

## Alternatives Considered

### Call BGG during collection views or game draws

* **Benefit:** Game details could reflect later BGG changes without a local update process.
* **Cost:** Regular use would depend on BGG availability, authorization, and request limits. A game-night draw could fail because an outside service is unavailable.
* **Reason for rejection:** Rejected by author: BGG is only a source of information while adding a game. The app stores selected details and uses its own database afterward.

### Maintain a separate editable group collection

* **Benefit:** A group could manage titles independently of who owns or shares them.
* **Cost:** The separate list could drift from members' active shares. Removing a member or unsharing a game would require extra synchronization rules.
* **Reason for rejection:** Rejected for this design: the group collection is derived from active member shares, so its owner list and available titles stay aligned.

### Release only a shared list and picker

* **Benefit:** This would test the main game-night problem with fewer account, invitation, and ownership features.
* **Cost:** It would not give members personal collections or show who shared each title, both of which are part of the requested group workflow.
* **Reason for rejection:** Not selected for the current scope. It remains a smaller validation path if the first release needs to be reduced.

### Require members to mark games available for each game night

* **Benefit:** The picker would be less likely to suggest a game nobody can bring.
* **Cost:** Members would need to update availability before every draw, adding a step to the main flow.
* **Reason for rejection:** Deferred by author: members can draw again if the selected game is unavailable.

### Exclude expansions or require a shared base game

* **Benefit:** The picker would be less likely to suggest an expansion the group cannot play by itself.
* **Cost:** It would need dependency data and more rules when games are added, shared, or removed.
* **Reason for rejection:** Rejected by author: expansions are treated as whole games and follow the same player-range rule as base games.

## Non-Functional Requirements

- **Access:** The API verifies a Clerk session on every private route. It checks active group membership for group reads and checks creator identity for invitations and member removal. The browser never receives BGG, Resend, or database secrets.
- **Reliability:** A BGG failure affects searching or adding a game, not existing collections or draws. A cover-copy failure leaves the imported game usable with a local placeholder. Invitation send failures remain visible to the creator and can be retried.
- **Data integrity:** Database uniqueness rules prevent duplicate personal entries, duplicate group shares, and duplicate canonical BGG games. Share removal and member removal use transactions. A draw uses one distinct candidate per BGG ID.
- **Vercel deployment:** Web and API deploy as separate Vercel projects from one repository. The API uses a pooled PostgreSQL connection for request traffic. Development, preview, and production use separate databases. Apply reviewed migrations before deploying code that needs them; do not run migrations as part of every preview build.
- **Operations:** Record BGG status and latency during imports, email send failures, authorization denials, share changes, eligible game counts, and draw outcomes. Keep tokens, invitation links, and full email addresses out of logs. Track request IDs across the web app and API.
- **BGG use:** Confirm that the approved BGG application license covers the intended public use and storage of game text and covers before launch. Show the linked “Powered by BGG” mark and source credit. Do not train an image or language model on BGG data.

## Detailed Implementation Plan

The repository uses a pnpm workspace with `apps/web`, `apps/api`, and `packages/contracts`. The two apps are separate Vercel projects. The shared contract package holds request and response schemas, while the API remains the only writer to PostgreSQL and the only caller of BGG and Resend.

### Behavior and data rules

1. **Accounts:** Clerk handles email/password sign-up, password recovery, Google sign-in, and session renewal. The API uses the verified Clerk user ID as the stable user key. It stores a local user row on the first authenticated request. A verified email address is needed to accept an invitation.
2. **Game import:** Search only `boardgame` and `boardgameexpansion` through BGG XML API2. The add request takes a BGG ID, fetches its `thing` details server-side, and records the BGG ID, item type, primary and alternate names, publication year, description, minimum and maximum players, play-time values, minimum age, designers, publishers, categories, and source page URL. Preserve the source text without rewriting it. If the ID is already stored, reuse that game record and skip another BGG detail request. A user may have only one personal entry per BGG ID.
3. **Covers:** At import, copy the BGG cover or thumbnail into a separate PostgreSQL record keyed by BGG ID if the approved BGG license permits that use. Serve it through the API and store only the app route, not a BGG image URL, for normal display. Validate the source host, content type, and size before downloading. If the image is absent or copying fails, use an original local placeholder; the game remains addable. Do not crop or alter copied BGG images.
4. **Invitations:** Only the group creator can invite, revoke, resend, or remove members. A new invitation is valid for seven days and is sent through Resend. Store only a hash of its one-time acceptance token. The recipient may sign in with an existing account or create one through Clerk; acceptance succeeds only when a verified account email matches the invited email. Expired, revoked, used, and wrong-email links have distinct messages. Resending rotates the token. A failed email send is shown as failed delivery and can be retried; it does not grant membership.
5. **Group sharing:** Members share only games in their own personal collection. A group game is derived from active shares and shows all current sharing members. Unsharing removes that member's link. Removing a personal game automatically removes that user's shares of it from every group, after the UI explains this effect. Removing a member removes their shares in that group. The group entry disappears only when its last share disappears. The creator cannot be removed through the member-removal action.
6. **Draw:** Accept only a positive whole-number headcount. Exclude games with missing or invalid player ranges and mark them as having unknown player counts in collection views. Count each BGG ID once, regardless of how many members share it. Choose uniformly from eligible IDs using a count and random offset over a stable ordered query, then fetch its sharing members. On a redraw, exclude the immediately previous BGG ID when at least two games qualify; if only one qualifies, return it with a note that it is the only match. An empty group and a group with no matching known player range return different outcomes. No draw calls BGG.
7. **Branding:** Generate original meeple illustrations for the welcome, empty collection, and game-night result states. Use a small meeple mark as the brand symbol. Keep game covers and text dominant in dense collection views. Put the BGG attribution in a visible shared layout area. Generated art must not include BGG game artwork.

### API contract

All private routes require Clerk authentication. Responses distinguish validation, permission, not-found, conflict, and upstream-service errors with stable error codes. The API exposes:

| Route | Purpose |
| --- | --- |
| `GET /v1/catalog/search?q=` | Search BGG during game addition; return bounded base-game and expansion results. |
| `GET /v1/collection`, `POST /v1/collection`, `DELETE /v1/collection/:bggId` | List, add, and remove personal games. |
| `GET /v1/groups`, `POST /v1/groups`, `GET /v1/groups/:groupId` | List, create, and open groups. |
| `GET /v1/groups/:groupId/games` | Return distinct shared games with sharing members. |
| `GET /v1/groups/:groupId/members`, `DELETE /v1/groups/:groupId/members/:userId` | List members and let the creator remove one. |
| `GET /v1/groups/:groupId/invitations`, `POST /v1/groups/:groupId/invitations`, `POST /v1/groups/:groupId/invitations/:invitationId/resend`, `DELETE /v1/groups/:groupId/invitations/:invitationId` | Manage invitations as the creator. |
| `GET /v1/invitations/:token`, `POST /v1/invitations/:token/accept` | Preview and accept an invitation after email verification. |
| `POST /v1/groups/:groupId/shares`, `DELETE /v1/groups/:groupId/shares/:bggId` | Share or unshare a personal game. |
| `POST /v1/groups/:groupId/picks` | Draw for a headcount, optionally excluding the previous result. |
| `GET /health` | Report API process health without private data. |

### Target files to create or modify

Each row is one planned file. Paths are relative to the repository root. The existing `.env` contains `BGG_TOKEN`; keep it local and do not copy its value into the draft or source control.

| File | Action and reason |
| --- | --- |
| `./package.json` | Create workspace scripts for install, build, lint, test, and Prisma migrations. |
| `./pnpm-workspace.yaml` | Create the three-package workspace layout. |
| `./pnpm-lock.yaml` | Create a lockfile so both Vercel projects install the same dependency versions. |
| `./tsconfig.base.json` | Create shared TypeScript compiler settings. |
| `./.gitignore` | Create rules excluding `.env`, generated clients, build output, and local artifacts. |
| `./.env.example` | Create names and descriptions for Clerk, API URL, PostgreSQL, BGG, Resend, and cover-storage settings without secrets. |
| `./README.md` | Create local setup, separate Vercel project setup, database migration, BGG approval, and test instructions. |
| `./packages/contracts/package.json` | Create a package consumed by the web and API apps. |
| `./packages/contracts/tsconfig.json` | Configure contract package compilation. |
| `./packages/contracts/src/index.ts` | Define shared validated request, success, and error shapes for the listed API routes. |
| `./apps/web/package.json` | Add Next.js, Clerk, contract package, UI, and test dependencies and scripts. |
| `./apps/web/tsconfig.json` | Configure Next.js TypeScript and workspace imports. |
| `./apps/web/next.config.ts` | Configure Next.js build behavior and any legacy app-hosted image URLs. |
| `./apps/web/src/app/layout.tsx` | Provide Clerk context, common navigation, accessible page frame, and BGG attribution. |
| `./apps/web/src/app/globals.css` | Define warm colors, type scale, spacing, cards, focus states, and reduced-motion rules. |
| `./apps/web/src/app/page.tsx` | Create the welcome page with a clear path to collection and groups. |
| `./apps/web/src/app/sign-in/[[...sign-in]]/page.tsx` | Show Clerk email/password and Google sign-in. |
| `./apps/web/src/app/sign-up/[[...sign-up]]/page.tsx` | Show Clerk account creation and email verification. |
| `./apps/web/src/app/collection/page.tsx` | List personal games and expose add, remove, and share actions. |
| `./apps/web/src/app/groups/page.tsx` | List joined groups and allow group creation. |
| `./apps/web/src/app/groups/[groupId]/page.tsx` | Show deduplicated group games and sharing members. |
| `./apps/web/src/app/groups/[groupId]/members/page.tsx` | Show members and creator-only invitation and removal controls. |
| `./apps/web/src/app/groups/[groupId]/game-night/page.tsx` | Show headcount entry, draw result, redraw, and empty/no-match states. |
| `./apps/web/src/app/invitations/[token]/page.tsx` | Guide new or existing users through verified-email acceptance. |
| `./apps/web/src/lib/api.ts` | Attach Clerk session tokens to calls to the separate API and map stable errors to UI states. |
| `./apps/web/src/components/game-card.tsx` | Display stored game details, expansion label, player range, and sharing members. |
| `./apps/web/src/components/game-search.tsx` | Provide bounded BGG search and selection during addition only. |
| `./apps/web/src/components/share-control.tsx` | Let a member change their group shares and see removal effects. |
| `./apps/web/src/components/draw-panel.tsx` | Validate headcount and show the selected game, eligible count, and redraw behavior. |
| `./apps/web/public/brand/meeple-mark.svg` | Add an original meeple brand mark. |
| `./apps/web/public/illustrations/welcome.webp` | Add original welcome artwork. |
| `./apps/web/public/illustrations/empty-collection.webp` | Add original empty-state artwork. |
| `./apps/web/public/illustrations/invitation.webp` | Add original invitation artwork. |
| `./apps/web/public/illustrations/game-night.webp` | Add original game-night artwork. |
| `./apps/web/tests/main-flows.spec.ts` | Cover sign-in handoff, add/share flow, invitation acceptance, and draw states in browser tests. |
| `./apps/api/package.json` | Add Fastify, Clerk, Prisma, BGG XML parsing, Resend, contract, and test dependencies. |
| `./apps/api/tsconfig.json` | Configure API TypeScript output for Vercel and local development. |
| `./apps/api/src/index.ts` | Start the Vercel-detected Fastify listener. |
| `./apps/api/src/api.ts` | Register routes, CORS policy, request IDs, and error handler. |
| `./apps/api/src/config.ts` | Validate required environment settings without exposing secret values. |
| `./apps/api/src/db.ts` | Create the Prisma client with a pooled PostgreSQL connection for API traffic. |
| `./apps/api/src/auth.ts` | Verify Clerk sessions and enforce user, group-member, and group-creator checks. |
| `./apps/api/src/routes/catalog.ts` | Implement bounded BGG search for the add flow. |
| `./apps/api/src/routes/collection.ts` | Implement personal collection list, import, and removal with share withdrawal. |
| `./apps/api/src/routes/groups.ts` | Implement group creation, listing, details, member removal, and deduplicated group games. |
| `./apps/api/src/routes/invitations.ts` | Implement invite creation, resend, revoke, preview, and acceptance. |
| `./apps/api/src/routes/shares.ts` | Implement member-controlled share and unshare operations. |
| `./apps/api/src/routes/picks.ts` | Implement local-only player-count filtering and uniform drawing. |
| `./apps/api/src/services/bgg.ts` | Call BGG XML API2 with server-only token, parse search and thing responses, and handle throttling or failure. |
| `./apps/api/src/services/cover-store.ts` | Validate and download a permitted cover during import for PostgreSQL storage. |
| `./apps/api/src/services/mail.ts` | Send invitation messages through Resend and report delivery failures. |
| `./apps/api/src/lib/audit.ts` | Record safe invitation, membership, sharing, and draw events with request IDs. |
| `./apps/api/prisma/schema.prisma` | Define users, canonical games, personal collection links, groups, memberships, shares, and invitations with unique keys and indexes. |
| `./apps/api/prisma/migrations/001_initial/migration.sql` | Create the initial PostgreSQL tables and constraints. |
| `./apps/api/prisma/migrations/002_game_covers/migration.sql` | Add separate PostgreSQL storage for imported cover bytes. |
| `./apps/api/prisma.config.ts` | Point Prisma migration commands at the direct migration connection. |
| `./apps/api/tests/group-picker.test.ts` | Test deduplication, multi-owner removal, missing ranges, expansions, no-match, redraw, and permissions. |
| `./apps/api/tests/invitations.test.ts` | Test invite ownership, verified-email matching, expiry, revocation, resend, and failed delivery. |
| `./apps/api/src/services/cover-store.test.ts` | Test BGG cover validation, download, and fallback behavior. |
| `./apps/api/tests/fixtures/bgg-search.xml` | Provide a fixed XML search response for import tests. |
| `./apps/api/tests/fixtures/bgg-thing.xml` | Provide fixed base-game and expansion detail responses for import tests. |
| `./docs/operations.md` | Document environment separation, migration order, token rotation, BGG and email failures, logs, and rollback. |
| `./docs/visual-direction.md` | Record the meeple style, palette, illustration use, attribution placement, and asset provenance. |

### Verification and rollout

1. Build and type-check all workspace packages. Run API integration tests against an isolated PostgreSQL database and mocked BGG, Resend, and Clerk boundaries. Run the browser journeys against local web and API services.
2. Confirm that adding a game makes BGG calls, while viewing collections, sharing, removing, inviting, and drawing make none. Confirm that the browser and web deployment contain no `BGG_TOKEN` or other API secrets.
3. Verify a game shared by two members stays visible after one unshares or is removed, and disappears only after the last share is gone. Verify creator-only membership changes and that wrong-email invite acceptance fails.
4. Verify player-count boundaries, missing data, expansion inclusion, a single eligible game, repeat draws, empty collections, and the split-party message. Check keyboard access, mobile layouts, contrast, and reduced motion.
5. Provision separate development, preview, and production PostgreSQL databases. Apply the initial migration to each before deploying the corresponding API. Deploy the API and web apps as separate Vercel projects from the same repository, with environment variables scoped to the appropriate project.
6. Before public launch, verify BGG application approval and license scope, the linked BGG attribution, Resend sending domain, and Clerk email/password and Google settings. A rollback redeploys the previous compatible API and web versions; destructive database migrations are deferred until no deployed version needs the old shape.

### Additional Resources

- [BGG XML API2](https://boardgamegeek.com/wiki/page/bgg_xml_api2), [API usage guidance](https://boardgamegeek.com/using_the_xml_api), and [XML API terms](https://boardgamegeek.com/wiki/page/XML_API_Terms_of_Use)
- [Clerk Fastify plugin](https://clerk.com/docs/reference/fastify/clerk-plugin)
- [Vercel Fastify deployment](https://vercel.com/docs/frameworks/backend/fastify)
- [Prisma deployment on Vercel](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel)
- [Resend on Vercel](https://vercel.com/marketplace/resend)

*Drafted with EGM*

