# Board Game Group Picker

* **Author:** Gogod
* **Date:** 2026-11-11
* **Status:** Working concept for review

## Overview

The main problem is choosing a game for game night. Users search BoardGameGeek (BGG) when adding a game, and the app stores that game's information in its own database. A group creator invites members by email and manages membership. Members share selected games from their personal collections with the group. The group collection shows each BGG game once and lists every member who shares it.

For game night, a member enters the number of people attending. The app randomly chooses a shared game whose stored player range includes that number. Expansions have separate entries and can be chosen. If no single game matches, the app says no single game supports that many people and suggests, "Maybe break down the party in multiple groups?" Members can draw again if an owner cannot bring the selected game. Regular collection, group, and picker operations use only data held by the app.

## Analysis

### Expansion rule and its trade-off

The author has chosen to treat each expansion as a whole game. An expansion is a separate collection entry and is eligible for a draw whenever its stored player range includes the headcount. The picker does not check for a base game or standalone playability. This keeps the rule simple, but a draw can return an expansion that the group cannot play by itself. The result should identify the entry as an expansion so members can decide whether to draw again.

### Availability and meaning of a draw

The picker filters by player count, not by whether a sharing member will bring the game. The result is therefore a suggestion, with sharing members shown and a visible way to draw again. A future option is for attendees to mark games available on a given night. That adds work for members and is outside the initial scope.

### BGG dependency

BGG XML API2 provides search and game details only while a user adds a game. The app copies the selected game's relevant details into its own database at that point. Opening collections, sharing games, browsing groups, and drawing a game make no BGG requests. Stored details are not automatically refreshed from BGG. [BGG's usage guidance](https://boardgamegeek.com/using_the_xml_api) requires application authorization, recommends server-side calls and caching, and requires a linked “Powered by BGG” logo for public-facing apps. The workspace has `BGG_TOKEN` in `.env`; its value must stay on the server. Search and detail requests should be bounded, with clear handling for loading, no results, rate limits, and upstream failure. A BGG outage blocks adding a game through BGG but does not block regular use of games already stored in the app. Application approval and working authorization are launch dependencies. The [XML API2 reference](https://boardgamegeek.com/wiki/page/bgg_xml_api2) describes the search and thing endpoints.

### Ownership, permissions, and data integrity

Use a BGG game ID as the title's identity. Store game details once, personal collection entries per user, and active shares per member and group. Derive the group collection and its owner list from those shares rather than storing a second editable copy. If one member stops sharing or leaves, remove only that member's share; keep the group game while another member shares it. Removing the last share removes the game from the group collection and picker. The group creator controls invitations and member removal. Invite acceptance, expiry, duplicate invites, and what happens to past picks remain to be specified in a design document.

### Visual and interaction direction

The app should feel friendly and recognizably about board games. Use a warm tabletop-inspired palette, clear type, and approachable shapes. Meeples can appear in the brand mark, navigation details, and empty states, with distinct colors or poses used to give the app a recognizable character. Use game cover art when available so people can identify games quickly. Original illustrations, including generated illustrations, are welcome for onboarding, empty collections, invitations, and the game-night draw. The selected game should feel like a small reveal, while its name, player range, expansion label, and sharing members remain easy to read. Keep decorative art away from controls and long game lists; support small screens, keyboard use, readable contrast, and reduced motion.

### Scope and operation

The root problem is the picker. Accounts, email invitations, collection management, and access checks are needed for the proposed group workflow but increase the first release's size. A smaller validation path is a shared list plus headcount picker before full member ownership. Use standard authentication and invitation services where they fit. No application code exists yet, so there is no current schema or client migration. Future game and share records should preserve BGG IDs and owner links through compatible schema changes. Operational records should capture BGG failures during game addition, invitation and sharing changes, eligible candidate counts, and draw outcomes without logging tokens or unnecessary personal data. There is no LLM feature or token budget.

## Goals vs. Non-Goals

**In-scope goals**

- Search BGG for base games and expansions during game addition, then store selected game details in the app.
- Create groups, invite members by email, and let the creator manage membership.
- Let members share and unshare their own collection entries with a group.
- Show one group entry per BGG game, with all current sharing members listed.
- Draw a shared game for a positive whole-number headcount within its stored BGG minimum and maximum player counts; allow another draw.
- Give distinct messages for an empty group collection and for no games matching the headcount.
- Give the app a friendly board-game identity using meeple motifs and original illustrations where they support the experience.

**Out-of-scope non-goals for the first release**

- Confirming which owner can bring a game on a particular night.
- Checking whether an expansion needs a base game.
- Splitting attendees into groups or choosing multiple games automatically.
- Scheduling events, tracking plays, ratings, or payments.
- Syncing a user's entire BGG collection automatically.

## Alternatives Weighed

- **Live BGG lookup for regular operations or every draw:** Rejected by the author. BGG is used only when adding a game; the app stores game details and uses them for all regular operations.
- **Separate editable group collection:** Rejected for the working concept because it can drift from members' active shares. The group view is derived from shares.
- **Only a shared list and picker for the first release:** Still a possible smaller validation path. It reduces account and ownership work but does not satisfy the requested personal collection and owner list.
- **Require owners to mark games available each game night:** Deferred by the author. Members can draw again when a selected game cannot be brought.
- **Exclude expansions or require a shared base game:** Rejected by the author. Expansions are treated as whole games for the picker, accepting that some may need another game to play.

## Key Decisions & Staging for Next Steps

1. The first release centers on choosing a game from a group's shared collection by headcount.
2. BGG supplies search results and game details only when adding a game. The server uses `BGG_TOKEN`; the app stores selected details and runs all later collection, group, and picker operations from its own database.
3. The group creator invites members by email and manages membership. Members choose which personal games to share.
4. Group games are deduplicated by BGG ID and list all active sharing members. A game remains while at least one share remains.
5. The picker includes expansions as separate whole-game candidates based on BGG player range, without checking for a base game.
6. The visual design uses meeples and tabletop cues. Illustration and image generation can supply original supporting art, especially for onboarding, empty states, and the draw result.
7. Before implementation, specify invitation lifecycle, collection removal effects, which BGG fields to store at addition, picker repeat behavior, and basic usage limits.
