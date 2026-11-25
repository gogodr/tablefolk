# Sprint 3 Specification: In-Room Mini-Kit & Gathering Logistics

**Status:** Documented & Ready for Implementation  
**Depends on:** Sprint 1 (per-group voting points, availability filters, closed-event headcount, scoped cache) & Sprint 2 (modular event routes, updated roadmap).

---

## 1. Phase 1 Completion: In-Room Mini-Kit (`apps/web`)

Client-only tools inside the Event Room (`/groups/[groupId]/events/[eventId]`) and Group Game Night (`/groups/[groupId]/game-night`) designed for use at the physical table.

### 1.1 Interactive First-Player Decider
- **Participants:** Automatically seeded from confirmed `ATTENDING` RSVPs + named guests (or manual player list in Group Game Night).
- **UI & Motion:** Animated meeple avatars (`apps/web/public/brand/meeple-mark.svg` + CSS transforms, respecting `prefers-reduced-motion`) that spin/shuffle and highlight the starting player.
- **State:** Ephemeral client state; supports 1-click re-roll.

### 1.2 Optional Turn / AP Timer (Analysis Paralysis Alert)
- **Presets:** 60s, 90s, 120s, 180s, or custom duration.
- **Behavior:** Start / Pause / Next Player / Reset controls with visual progress ring and subtle optional Web Audio chime when time expires.
- **Persistence:** Optional `localStorage` state per `eventId` so accidental screen lock doesn't lose the active turn timer.

### 1.3 BGG Reference & Rules Links
- **Scope:** Complement the existing `▶ Rules Video` YouTube link on the locked Official Lineup with a direct link to the game's BGG Files/Rules tab (`https://boardgamegeek.com/boardgame/${bggId}/files`).

---

## 2. Phase 2 Foundations: Gathering Logistics

### 2.1 Discord Webhooks (Per Group)
- **Schema (`apps/api/prisma/schema.prisma`):** Add optional `discordWebhookUrl String?` on `Group` (managed by group creator, masked on read).
- **Triggers:**
  1. Event scheduled (`POST /v1/groups/:groupId/events`)
  2. 3-Menu Trio poll opened (`POST /v1/events/:eventId/menu-poll/open`)
  3. Official lineup locked (`PUT /v1/events/:eventId/official` or `menu-poll/close`)
- **Delivery:** Fire-and-forget non-blocking `fetch` with timeout and structured audit log on failure (never blocks the API response).
- **WhatsApp:** Kept as 1-click formatted copy + `https://wa.me/?text=...` deep-link (no paid Business API required).

### 2.2 Multi-Table Splitter (8–16+ Attendees)
- **Contract (`packages/contracts`):** `POST /v1/events/:eventId/split-tables` accepting `{ tableCount: 2 | 3, totalMinutes, allowHeavy }`.
- **Algorithm (`apps/api/src/lib/picker.ts`):** Partition confirmed attendees into balanced table sizes (`ceil(n/k)`, `floor(n/k)`), ensuring each table receives a distinct game (or lineup) matching its sub-headcount without duplicate physical box conflicts.

### 2.3 Potluck & Beverage Checklist
- **Schema:** `EventSupplyItem` (`id`, `eventId`, `label`, `category`, `claimedByUserId`, `createdAt`).
- **Endpoints:** `GET/POST /v1/events/:eventId/supplies`, `PATCH/DELETE /v1/events/:eventId/supplies/:itemId` for claiming/unclaiming snacks and drinks in the Event Room.

---

## 3. Phase 3 Direction (Long-Term)
- **BGG Play Logging Export / Assisted Link:** Export `COMPLETED` event `playedGames` + attendees as BGG-friendly CSV/JSON or pre-filled BGG log links (without storing user BGG passwords).
- **PWA & Offline Table Mode:** Add `manifest.json`, Service Worker asset caching, and an offline mutation queue on top of the per-user `TABLEFOLK_OFFLINE_CACHE_${userId}` store.
