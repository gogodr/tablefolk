# Tablefolk

A friendly place to catalog board games, share selected games with a group, and draw a game for the number of people at game night.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-black.svg)](https://fastify.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791.svg)](https://www.postgresql.org/)

---

## 📑 Quick Navigation

- [🍱 Evening Session Menu Planner](#-evening-session-menu-planner--anti-fatigue-engine)
  - [🧠 Hierarchy & Anti-Fatigue Rules](#-hierarchy--anti-fatigue-engine) · [☕ Dynamic Setup & Transition Buffers](#-dynamic-setup--intermission-buffers) · [🗳️ 3 Menu Options & 12 Archetype Recipes](#️-3-contrasting-menu-options--12-archetype-recipes-anti-paralysis) · [💾 Saving & Sharing Lineups](#-saving-and-sharing-the-approved-lineup)
- [📅 Global Events Calendar](#-global-events-calendar)
- [🏁 Event Completion & Played Games Reality](#-event-completion--played-games-reality)
- [👥 Redesigned Groups Experience](#-redesigned-groups-experience)
- [🗺️ How It Works](#how-it-works) · [✨ Key Features](#key-features)
- [📦 Local Setup](#local-setup)
  - [🐳 Docker Compose](#docker-compose) · [💻 Without Docker](#without-docker) · [🧪 Checks](#checks)
- [🚀 Deployment](#vercel) · [🎯 Future Roadmap](#️-future-roadmap--ideas)

---

## What is here

- `apps/web`: Next.js 16 app with design tokens, meeple illustrations, events room, session planner, and collection sync.
- `apps/api`: Fastify 5 API, Prisma schema, BGG sync, event RSVPs, weighted picker, dynamic buffer scheduler, and invitations.
- `packages/contracts`: shared input schemas, response types, and domain interfaces.
- `docs/designs/board-game-group-picker.md`: approved product and technical design.

The group collection shows each BGG game once and lists all members who share it. A game stays available while at least one member shares it. Expansions are independent choices. BGG is called only when searching for or syncing a collection; normal use reads the app database.

---

## 🍱 Evening Session Menu Planner & Anti-Fatigue Engine

Tablefolk includes an intelligent multi-game session orchestrator designed to plan a balanced 2 to 5-hour tabletop evening without cognitive burn. It structures the night into a satisfying narrative arc:

```mermaid
flowchart TD
    subgraph Inputs["1. Gathering Inputs"]
        A["👥 Headcount (RSVPs + Guests)"]
        B["⏱️ Total Gathering Duration (2h - 5h)"]
        C["🛡️ Allow Heavy Game (Checkbox)"]
    end

    subgraph PickerEngine["2. Smart Selection Engine"]
        D["🎯 Main Event (Anchor Game)\nPriority: Substantial titles >= 45m or Weight >= 2.0"]
        E["☕ Dynamic Setup & Transition Buffer\n15m - 30m scaled by BGG complexity & duration"]
        F["🍕 Warm-up (Optional)\nStrictly <= 35m, Weight <= 2.2, lighter & shorter than Main"]
        G["☕ Cooldown (Optional)\nStrictly <= 45m, anti-fatigue relaxed closer"]
    end

    subgraph Outputs["3. Result & Persistence"]
        H["✨ Tonight's Lineup Menu\nAccurate playtimes + transition buffers"]
        I["📌 Lock as Official Event Lineup\n(Publishes to attendees with rules videos)"]
        J["📋 1-Click WhatsApp / Discord Share\n(Formatted with emojis & times)"]
    end

    Inputs --> PickerEngine
    D --> E
    E --> F
    E --> G
    PickerEngine --> Outputs
    H --> I
    H --> J
```

---

### 🧠 Hierarchy & Anti-Fatigue Rules

To prevent unbalanced sessions (e.g., an intense 60-minute cooperative game being suggested as a "Warm-up" before a 30-minute party game), the engine enforces strict structural rules:

> ⚡ **Session Architecture Rules:**
> - **🎯 Main Event (Anchor Game):** In sessions $\ge 90$ min, substantial games ($\ge 45$ min or weight $\ge 2.0$) take absolute priority as the centerpiece.
> - **🍕 Warm-up:** Strictly capped at $\le 35$ min and weight $\le 2.2$ (Light). It must always be shorter and lighter than the Main Game ($duration \le mainDuration$ and $weight \le mainWeight$).
> - **☕ Cooldown:** Capped at $\le 45$ min. If the Main Game was Heavy ($weight > 3.2$), the Cooldown is strictly restricted to light games ($weight \le 2.0$) to prevent brain burn.
> - **🛡️ Anti-Fatigue Limit:** Never more than **1 Heavy game** per session, and a maximum of **3 games** total per gathering.
> - **📦 Expansion Bundling & Exclusion:** Standalone expansions (e.g. *Rising Sun: Daimyo Box*, *Survive 5-6 Player Mini Expansion*) are excluded as independent picks. Instead, they dynamically boost the base game's player count and are bundled together in the draw and session menu (e.g., `Rising Sun + Daimyo Box`).

---

### ☕ Dynamic Setup & Intermission Buffers

Real board game nights require downtime between boxes: packing up the previous game, setting up modular boards, dealing cards, grabbing snacks, and teaching rules. Tablefolk dynamically scales this buffer before each upcoming title:

| Category | BGG Criteria | Real Tabletop Overhead | UI Badge & Reason |
| :--- | :--- | :--- | :--- |
| 🔴 **Heavy / Epic** | Weight $\ge 3.2$ or Duration $\ge 90$m | Miniatures, multi-boards, draft screens & full rules teach (*Rising Sun*, *Brass*, *Scythe*) | `☕ 30m Setup & Rules Teach (Heavy game)` |
| 🟡 **Medium-Heavy** | Weight $\ge 2.6$ or Duration $\ge 70$m | Board setup & rules refresh (*Wingspan*, *Clank!*, *Catan* 5-6p) | `☕ 25m Table Setup & Rules Overview` |
| 🟢 **Medium Standard** | Weight $\ge 2.0$ or Duration $\ge 45$m | Standard board placement & shuffling (*WoW: Lich King*, *Ticket to Ride*) | `☕ 20m Intermission & Board Setup` |
| 🍕 **Light / Filler** | Weight $< 2.0$ and Duration $< 45$m | Fast deck shuffle, snack break & quick rules (*Avalon*, *Sushi Go!*) | `☕ 15m Quick Reset & Snack buffer` |

---

### 🗳️ 3 Contrasting Menu Options & 12 Archetype Recipes (Anti-Paralysis)

To eliminate the classic *"What should we play? I don't care, you pick"* paralysis, Tablefolk generates **3 contrasting multi-game menus** simultaneously. Rather than repeating a static template, the planner samples from a rich library of **12 dynamic tabletop recipes** across 7 macro-categories:

| Macro Category | Archetype Recipe | Style Badge | Table Focus & BGG Criteria |
| :--- | :--- | :--- | :--- |
| 🔴 **Heavy** | **Brain Burners & Heavy Euros** | `🧠 Heavy Euro & Brain Burner` | Deep economic systems, market efficiency & worker placement ($w \ge 3.0$ or $w \ge 2.8$ with worker placement) |
| 🔴 **Heavy** | **Epic & Grand Strategy** | `🔴 Heavy Strategy` | Centerpiece strategic anchor with dedicated setup buffers ($w \ge 2.8$ or duration $\ge 90$m) paired with light fillers |
| ⚔️ **Strategy** | **Area Control & Tactical Combat** | `⚔️ Area Control & Clashes` | Direct conflict, territory control, combat & high stakes (*Area Majority*, *Area Movement*, *Wargame*) |
| 🤝 **Thematic** | **Cooperative Survival & Teamwork** | `🤝 Cooperative Teamwork` | Crisis management and collective survival (*Cooperative Game*, *Communication Limits*, *Traitor*) |
| ⚙️ **Strategy** | **Engine Building & Synergies** | `⚙️ Engine & Combos` | Card drafting, tableau building, resource production & combos (*Engine Building*, *Drafting*, *Deck Building*) |
| 🧩 **Strategy** | **Tile Placement & Spatial Puzzles** | `🧩 Spatial Puzzles & Tiles` | Tactile spatial drafting and pattern building (*Tile Placement*, *Pattern Building*, *Hexgrid*, *Puzzle*) |
| ⚡ **Social** | **Social Deduction & Table Talk** | `⚡ High Interaction` | Fast-paced bluffing, voting, trading, hidden roles & table conversation (*Social Deduction*, *Bluffing*, *Party*) |
| 🎉 **Social** | **Party Mayhem & Push-Your-Luck** | `🎉 Party & High Energy` | High-energy laughter, push-your-luck thrills & instant turns ($w \le 2.0$, *Push Your Luck*, *Dexterity*) |
| 🗺️ **Thematic** | **Thematic & Narrative Worlds** | `🗺️ Thematic Adventure` | Rich narrative immersion, sci-fi/fantasy worldbuilding & tabletop quests (*Adventure*, *Sci-Fi*, *Horror*) |
| ⭐ **Favorites** | **Table Favorites & Wishlist** | `⭐ Group Wishlist Favorites` | Triples voting points from confirmed attendees to showcase collective community desires |
| 🎲 **Accessible** | **Breezy Gateway & Modern Classics** | `🎲 Accessible Classics` | Smooth modern classics with zero rules friction ($w \le 2.4$, duration $\le 60$m) |
| 🎲 **Wildcard** | **Wildcard & Blind Draw** | `🎲 Pure Random Wildcard` | Pure luck of the draw: completely flat, neutral weights ($w = 1$) letting the dice decide without bias |

**Macro-Category Contrast Engine:**
- **Dynamic Sampling:** Viable recipes are filtered based on the group's actual collection and attendee headcount, then shuffled uniformly.
- **Anti-Monotony Guard:** The selector enforces distinct macro-categories across Options A, B, and C (e.g. Brain Burner vs Social vs Wildcard), ensuring confirmed attendees have genuinely distinct tabletop vibes to choose from.
- **Unique Anchors:** Main games are mutually exclusive across the 3 options.

**Group Voting & Polling:**
* **In-App Voting:** Hosts open a live poll with 1 click. Attendees vote for Option A, B, or C; real-time counters and member avatars reveal the group favorite.
* **1-Click WhatsApp / Discord Poll:** Copies a pre-formatted ballot with times, games, and links to paste into chat channels.
* **Official Lock:** The host can lock the winning menu with 1 click to publish the official lineup.

---

### 📅 Global Events Calendar

Access every upcoming and past game night across all your tabletop groups in one unified view (`/events` & top navigation):
* **Monthly Interactive Grid:** Navigate months with today highlights, headcount badges, and clickable event pills with voting and lineup statuses.
* **Timeline View:** Chronological feed filterable by `All`, `My RSVPs (Attending)`, `Voting Active`, and `Completed`.
* **Direct RSVP:** Confirm or change attendance without leaving the calendar.

---

### 🏁 Event Completion & Played Games Reality

When game nights wrap up, reality sometimes differs from the planned menu: a game ran long, or a surprise filler hit the table.
* **Finish & Record (`POST /v1/events/:eventId/close`):** The host reviews which games actually made it to the table (pre-filled with the official lineup, plus optional group shelf additions).
* **True Wishlist Point Decay:** Only the games that were **actually played** consume their voting points. Any planned title that didn't get tabled preserves its community interest points for future draws!

---

### 👥 Redesigned Groups Experience

The `/groups` hub has been restructured for immediate access:
* **Your Groups Upfront:** Active groups appear first with member count and game shelf badges.
* **Expandable Creation Drawer:** Click `+ New Group` in the header to open an inline creation panel without cluttering the screen.
* **Footer Quick-Start:** Easily start another group anytime from the footer card.

---

### 💾 Saving and Sharing the Approved Lineup

1. **Inside an Event (`/groups/[groupId]/events/[eventId]`):**
   - Click **`📌 Set as Official Event Lineup`**.
   - Locks the schedule to the top of the event page for all confirmed attendees with assigned carriers (`🎒 Bringer: [Member]`) and YouTube rules video links (`▶ Rules Video`).
2. **In Direct Group Game Night (`/groups/[groupId]/game-night`):**
   - Click **`📌 Save as Group Event`** to generate a group event with today's date and lock the lineup in 1 click.
   - Click **`📋 Copy Menu`** to copy a formatted roster with emojis and exact times directly into your WhatsApp, Discord, or Telegram group chat.

---

## How It Works

```mermaid
flowchart LR
    A["1. Sync with BGG"] --> B["2. Share in Group"]
    B --> C["3. Schedule Event"]
    C --> D["4. Vote Want-to-Play"]
    D --> E["5. Draw & Play!"]
```

1. **Catalog & Sync**: Search BoardGameGeek or import your entire owned collection with one click, storing playtimes, player counts, edition names, and complexity ratings.
2. **Curate Group Shelves**: Share games into group tables. Copies are deduplicated automatically so each title appears once with all sharing owners and edition variants listed.
3. **Schedule Game Nights**: Any member can create an event with date, time, location, and host assignment. Attending members RSVP with guest counts (`+Guests`).
4. **Build Hype (Want-to-Play)**: Members allocate voting points to games they are excited to play (theirs or friends'). Points persist across sessions if a title is not drawn.
5. **Contextual Headcount Picker**: The picker filters games based on who is actually attending and which games can travel (host's home games are auto-eligible), applying duration and complexity filters with weighted odds. Winning games decay their points to rotate the library naturally!

---

## Key Features

- **Game Night Events & RSVPs**: Any group member can schedule game nights with date, time, location, and host assignment. Members RSVP (`Attending`, `Maybe`, `Declined`) with guest counts (`+Guests`), automatically calculating total table headcount.
- **Physical Availability & Edition Tracking**: Mark personal copies as available to travel, "Home only" (which automatically become eligible when hosting!), or unavailable (lent out, too heavy, under repair), plus track specific edition names.
- **BGG Collection Sync & Smart Enrichment**: Connect your BoardGameGeek username with 1-click remembered sync. Imports owned games, expansions, playtimes, player counts, categories, and mechanics. Manual enrichment processes up to 30 games per batch with a 30-day cooldown to prevent unrated titles from stalling the queue.
- **Rich Game Detail Modal & Clean Cards**: Keep shelves and tables visually clean while providing deep metadata on tap: high-resolution box art, player counts with expansion support, BGG weight, categories, mechanics chips, multi-paragraph synopsis, credits, and an included expansions showcase.
- **Session Menu Planner with Mechanics Affinity Slider**: Curate 2 to 5-hour multi-game evenings with dynamic setup and cooldown buffers. Fine-tune selection with the **Mechanics & Style Affinity slider**—steer the table toward a themed night (`🎯 Themed`, e.g., secret roles/social deduction) or maximize variety across genres (`🌈 Variety`).
- **"Want to Play" Wishlist & Weighted Draw**: Members earn voting points to back games they want to see on table. Points accumulate across weeks and increase the game's odds in the event draw, resetting only upon victory to rotate the group's library naturally.
- **Contextual Event Picker**: Filters candidate games based on who is actually attending, excluding games that cannot travel unless hosted at the owner's home, with optional duration (`≤45m`, `≤90m`, `≤2h`) and BGG complexity filters.
- **Unified Search, Filters & Expansion Views**: Search instantly, filter by ownership, wishlist popularity, player count (with expansion boosts), complexity, and toggle between `🧩 Grouped` and `📄 All boxes` view modes in both personal collection and shared group shelves.

---

## Local setup

### Docker Compose

Install Docker with Compose, then run from the repository root:

```sh
docker compose up --build
```

Open `http://localhost:3000`. Compose starts PostgreSQL, applies Prisma migrations (including events and wishlist tables), starts the API at `http://localhost:4000`, and runs the Next.js app. Source edits in `apps/web/src`, `apps/api/src`, and `packages/contracts/src` reload automatically. Database data persists in a Docker volume. The PostgreSQL port is available on `localhost:5432` with database, user, and password all set to `tablefolk` for local testing.

For signed-in features, copy `.env.example` to the root `.env` and fill in `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from the same Clerk development instance. Compose passes the web publishable key to the API unless `CLERK_PUBLISHABLE_KEY` is explicitly set. Compose reads these values from the root `.env`; values in `apps/web/.env.local` are used only by the non-Docker workflow. Without Clerk keys, the API health route and web setup page remain available, while authenticated API routes return a configuration error. Set `BGG_TOKEN` to test game searches and collection sync, and `RESEND_API_KEY` plus `RESEND_FROM_EMAIL` to test invitation emails. Clerk, BGG, and Resend remain external services. Register `http://localhost:3000` in Clerk as an allowed local origin and redirect target. Compose always uses its own PostgreSQL service, regardless of database URLs in `.env`.

Stop the stack with `docker compose down`. To discard its local database and regenerate the development volumes, run `docker compose down -v`. Rebuild with `docker compose up --build` after changing dependencies or files outside the mounted source and Prisma directories.

If signed-in API requests return 401 and the API logs `session-token-nbf`, sync the host computer's clock. Docker containers use the host clock, and Clerk rejects tokens that appear to be from the future. After the clock is corrected, sign out and back in to refresh the session.

### Without Docker

Use Node 22 and Corepack. Install dependencies from the repository root:

```sh
corepack pnpm install
```

Copy `.env.example` to `.env`. Keep the existing `BGG_TOKEN` in the root `.env`. Fill in the remaining API values: a PostgreSQL `DATABASE_URL` (and `DIRECT_URL` for migrations when using a pooler), Clerk keys, Resend credentials and verified sending address. Neon’s Vercel integration supplies `DATABASE_URL_UNPOOLED`, which Prisma can also use for migrations. Copy the `NEXT_PUBLIC_*` and `CLERK_SECRET_KEY` values to `apps/web/.env.local`; Next.js reads that file for local web development. Set `NEXT_PUBLIC_API_URL` to `http://localhost:4000` and `WEB_ORIGIN`/`PUBLIC_WEB_URL` to `http://localhost:3000` locally. Never commit either env file.

In Clerk, enable email/password and Google sign-in, then register the local and deployed web URLs as allowed origins and redirect targets. Create a PostgreSQL database and run:

```sh
corepack pnpm db:generate
corepack pnpm db:migrate
```

Start the two processes in separate terminals:

```sh
corepack pnpm dev:api
corepack pnpm dev:web
```

Open `http://localhost:3000`. The home page and setup notice work before credentials are configured; collection and group actions require the services above.

---

## Checks

```sh
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

The tests cover picker filtering (headcount, duration, BGG weight), deduplication, weighted draws, rerolls, and BGG parsing. Full signed-in and email flows require test accounts and service credentials.

---

## Vercel

Create two Vercel projects from this repository. Set their root directories to `apps/web` and `apps/api`. Keep the workspace lockfile and `packageManager` setting at the repository root. Choose Next.js for the web project and Fastify for the API project; Vercel detects the API entry point at `src/index.ts`. Use Node 22. Each app's build script compiles the shared contracts package before building itself. Vercel should install the workspace dependencies from the root lockfile.

Set `NEXT_PUBLIC_API_URL` to the API's HTTPS URL and set `WEB_ORIGIN` and `PUBLIC_WEB_URL` to the web project's HTTPS URL. Put `BGG_TOKEN`, database URLs, Resend credentials, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY` only in the API project. The web project needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and its own `CLERK_SECRET_KEY` for Clerk's Next.js integration. Keep preview and production databases separate. Configure matching allowed origins and redirect URLs in Clerk. A preview deployment with no credentials displays the public home page and a setup notice, but collection, groups, invitations, and picks cannot run.

Apply migrations to each environment before deploying code that needs them:

```sh
corepack pnpm --filter @tablefolk/api db:deploy
```

Confirm the BGG application license covers the intended public use and storage of text and cover images before launch. Set `BGG_COVER_STORAGE_ALLOWED=true` in the API project only after cover storage is approved. Covers are downloaded once when a game is imported, stored in PostgreSQL, and served by the API; collection views do not call BGG. The site displays BGG's linked credit image in the footer and game search, and each game links to its source. If cover copying is unavailable, Tablefolk uses its own placeholder. Configure a verified Resend sending domain before trying invitations.

See [operations](docs/operations.md) for deployment and recovery details.

---

## 🗺️ Future Roadmap & Priorities

Tablefolk focuses on what happens **around the physical table**: social coordination, anti-fatigue session curation, and live gathering dynamics. **BoardGameGeek remains the undisputed single source of truth** for game metadata and personal play logs.

### 🟢 Phase 1: In-Room Table Identity & Guest Enhancements (Near-term)
- [x] **⚡ Client-Side Reactive Caching**: Instant navigation and 0ms latency with TanStack Query.
- [ ] **🎲 In-Room Mini-Kit & Animated Meeples**:
  - Interactive **First-Player Decider** featuring animated meeple avatars.
  - Optional **Turn / AP Timer** (Analysis Paralysis alert) for heavy turns.
  - 1-click **Rules Video & Reference links** on the locked official lineup.
- [ ] **👥 Named Guests & Attendance Reality**:
  - Support naming additional guests in RSVPs (e.g., *"Carlos (+ Andrea)"* instead of anonymous `+1`).
  - Precise attendance confirmation in event wrap-up to reflect who actually sat at the table.
- [ ] **🎯 BGG Community "Best at X" Badge**: Display community-recommended player count consensus directly on game cards.

### 🟡 Phase 2: Gathering Notifications & Group Logistics (Mid-term)
- [ ] **🔔 Discord & WhatsApp Webhooks**:
  - Automated rich embeds when an event is scheduled.
  - Instant notification blast when the 3-Menu Trio poll opens for voting.
  - Final call alert when the host locks the Official Lineup.
- [ ] **🪑 Multi-Table Splitter**: Intelligent partitioning for large groups (8–16+ attendees) into 2 balanced parallel game tables without time clashes.
- [ ] **🍕 Potluck & Beverage Checklist**: Lightweight collaborative table board for food and drinks tied to the event room.

### 🟣 Phase 3: Platform & Ecosystem Integrations (Long-term)
- [ ] **🔄 BGG Play Logging Sync**: 1-click export of the completed session's played games directly to the attendee's personal BoardGameGeek play log.
- [ ] **🌐 Multilingual Interface (i18n)**: English / Spanish toggle with `next-intl` (preserving original BGG metadata).
- [ ] **📱 PWA & Offline Table Mode**: Full progressive web app with offline local caching for playing in cabins, basements, or venues with spotty connection.
