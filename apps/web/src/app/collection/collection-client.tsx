"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectionGame, GroupSummary, BggSyncResult } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { GameSearch } from "@/components/game-search";
import { ShareControl } from "@/components/share-control";
import { useApi } from "@/lib/api";

type Filter = "all" | "boardgame" | "boardgameexpansion" | "available" | "unavailable";
type SortOption = "name-asc" | "name-desc" | "weight-desc" | "weight-asc" | "time-asc" | "year-desc" | "recent";
type PlayerFilter = "all" | "2" | "3-4" | "5+";
type WeightFilter = "all" | "light" | "medium" | "heavy";
type SharedFilter = "all" | "shared" | "unshared";

export function CollectionClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [games, setGames] = useState<CollectionGame[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const [weightFilter, setWeightFilter] = useState<WeightFilter>("all");
  const [sharedFilter, setSharedFilter] = useState<SharedFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");

  // Interaction Modals / Panels
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // BGG Sync & Enrich State
  const [bggUsername, setBggUsername] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [collection, groupData, bggProfile] = await Promise.all([
        api<{ games: CollectionGame[] }>("/v1/collection"),
        api<{ groups: GroupSummary[] }>("/v1/groups"),
        api<{ bggUsername: string | null }>("/v1/user/bgg-profile").catch(() => ({ bggUsername: null })),
      ]);
      setGames(collection.games);
      setGroups(groupData.groups);
      if (bggProfile.bggUsername) {
        setBggUsername(bggProfile.bggUsername);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your collection.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, load]);

  async function removeGame(bggId: number) {
    setRemovingId(bggId);
    try {
      await api(`/v1/collection/${bggId}`, { method: "DELETE" });
      setConfirmId(null);
      setSharingId(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove that game.");
    } finally {
      setRemovingId(null);
    }
  }

  async function updateAvailability(
    bggId: number,
    isAvailable: boolean,
    unavailableReason?: string | null,
    versionName?: string | null
  ) {
    try {
      await api(`/v1/collection/${bggId}`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable, unavailableReason, versionName }),
      });
      await load();
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update availability.");
    }
  }

  async function handleSyncBgg(e: React.FormEvent) {
    e.preventDefault();
    if (!bggUsername.trim()) return;
    setSyncing(true);
    setSyncStatus("Saving BGG profile and syncing games…");
    setError("");

    try {
      await api("/v1/user/bgg-profile", {
        method: "PUT",
        body: JSON.stringify({ bggUsername: bggUsername.trim() }),
      });

      const res = await api<BggSyncResult>("/v1/collection/sync-bgg", {
        method: "POST",
      });

      setSyncStatus(`Sync complete! ${res.importedCount} new games added, ${res.updatedCount} updated.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to sync BGG collection.");
      setSyncStatus(null);
    } finally {
      setSyncing(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    setEnrichStatus("Enriching BGG game weights & descriptions…");
    try {
      const res = await api<{ enrichedCount: number; remainingCount: number; totalCandidates: number }>(
        "/v1/collection/enrich",
        { method: "POST" }
      );
      if (res.enrichedCount > 0) {
        setEnrichStatus(
          `Enriched ${res.enrichedCount} games! ${
            res.remainingCount > 0 ? `(${res.remainingCount} more can be enriched)` : "All games up-to-date."
          }`
        );
        await load();
      } else {
        setEnrichStatus("All your games already have complete BGG metadata!");
      }
    } catch (cause) {
      setEnrichStatus(cause instanceof Error ? cause.message : "Could not complete enrichment.");
    } finally {
      setEnriching(false);
    }
  }

  // Missing weight count to show friendly enrichment reminder
  const missingWeightCount = useMemo(
    () => games.filter((g) => g.weight === null).length,
    [games]
  );

  // Filtered & Sorted Collection List
  const shown = useMemo(() => {
    let list = [...games];

    // 1. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.versionName && g.versionName.toLowerCase().includes(q)) ||
          g.designers.some((d) => d.toLowerCase().includes(q))
      );
    }

    // 2. Kind & Availability
    if (filter === "available") {
      list = list.filter((g) => g.isAvailable);
    } else if (filter === "unavailable") {
      list = list.filter((g) => !g.isAvailable);
    } else if (filter === "boardgame" || filter === "boardgameexpansion") {
      list = list.filter((g) => g.kind === filter);
    }

    // 3. Player Count
    if (playerFilter === "2") {
      list = list.filter((g) => (g.minPlayers ?? 0) <= 2 && (g.maxPlayers ?? 0) >= 2);
    } else if (playerFilter === "3-4") {
      list = list.filter((g) => (g.minPlayers ?? 0) <= 4 && (g.maxPlayers ?? 0) >= 3);
    } else if (playerFilter === "5+") {
      list = list.filter((g) => (g.maxPlayers ?? 0) >= 5);
    }

    // 4. Weight / Complexity
    if (weightFilter === "light") {
      list = list.filter((g) => g.weight !== null && g.weight <= 2.2);
    } else if (weightFilter === "medium") {
      list = list.filter((g) => g.weight !== null && g.weight > 2.2 && g.weight <= 3.5);
    } else if (weightFilter === "heavy") {
      list = list.filter((g) => g.weight !== null && g.weight > 3.5);
    }

    // 5. Sharing
    if (sharedFilter === "shared") {
      list = list.filter((g) => g.sharedGroupIds.length > 0);
    } else if (sharedFilter === "unshared") {
      list = list.filter((g) => g.sharedGroupIds.length === 0);
    }

    // 6. Sorting
    list.sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      if (sortBy === "weight-desc") return (b.weight ?? 0) - (a.weight ?? 0);
      if (sortBy === "weight-asc") return (a.weight ?? 99) - (b.weight ?? 99);
      if (sortBy === "time-asc") return (a.playingTime ?? 999) - (b.playingTime ?? 999);
      if (sortBy === "year-desc") return (b.yearPublished ?? 0) - (a.yearPublished ?? 0);
      return 0; // Default recent DB order
    });

    return list;
  }, [games, searchQuery, filter, playerFilter, weightFilter, sharedFilter, sortBy]);

  if (!isLoaded || loading) return <div className="page"><p className="loading">Loading your collection…</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Your collection starts here.</h1>
        <p>Sign in to add games and share them with a group.</p>
        <Link href="/sign-in" className="button">Sign in</Link>
      </section>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My collection</h1>
          <p>Keep the games you own close, manage what can travel, and share them with your groups.</p>
        </div>
        <Link href="/groups" className="button-secondary">View groups</Link>
      </div>

      {/* BGG Auto-Sync Section */}
      <section className="panel bgg-sync-panel">
        <div className="panel-header">
          <div>
            <h2>Import from BoardGameGeek</h2>
            <p>Connect your BGG account to automatically import and refresh your owned collection.</p>
          </div>
        </div>
        <form onSubmit={handleSyncBgg} className="inline-form">
          <div className="field">
            <label htmlFor="bgg-user">BGG Username</label>
            <input
              id="bgg-user"
              type="text"
              placeholder="e.g. Rahdo"
              value={bggUsername}
              onChange={(e) => setBggUsername(e.target.value)}
              disabled={syncing}
            />
          </div>
          <button type="submit" className="button" disabled={syncing || !bggUsername.trim()}>
            {syncing ? "Syncing with BGG…" : "Sync BGG Collection"}
          </button>
        </form>
        {syncStatus && <p className="form-success">{syncStatus}</p>}

        {missingWeightCount > 0 && (
          <div className="enrich-banner">
            <p>
              💡 <strong>{missingWeightCount} games</strong> don&apos;t have BGG complexity weights yet.
            </p>
            <button
              type="button"
              className="button-secondary button-small"
              onClick={() => void handleEnrich()}
              disabled={enriching}
            >
              {enriching ? "Enriching…" : "⚡ Enrich BGG data"}
            </button>
          </div>
        )}
        {enrichStatus && <p className="form-success">{enrichStatus}</p>}
      </section>

      <GameSearch onAdded={() => void load()} />

      <div className="section-title">
        <h2>Your games</h2>
        <p>
          Showing {shown.length} of {games.length} {games.length === 1 ? "game" : "games"}
        </p>
      </div>

      {/* Collection Search & Filters Toolbar */}
      <div className="collection-toolbar">
        {/* Instant Search Box */}
        <div className="collection-search-wrap">
          <span className="collection-search-icon">🔍</span>
          <input
            type="search"
            className="collection-search-input"
            placeholder={`Filter ${games.length} games by title, edition, or designer…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="collection-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Count Chips: Kind & Travel Availability */}
        <div className="count-filters" role="group" aria-label="Filter games by category">
          {(
            [
              { id: "all", label: "All games", count: games.length },
              { id: "available", label: "Available to travel", count: games.filter((g) => g.isAvailable).length },
              { id: "boardgame", label: "Base games", count: games.filter((g) => g.kind === "boardgame").length },
              { id: "boardgameexpansion", label: "Expansions", count: games.filter((g) => g.kind === "boardgameexpansion").length },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              className={`count-filter ${filter === item.id ? "active" : ""}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>

        {/* Advanced Filters & Sorting Row */}
        <div className="collection-filters-row">
          <div className="collection-select-group">
            {/* Player Count Filter */}
            <select
              className="collection-select"
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value as PlayerFilter)}
              aria-label="Filter by player count"
            >
              <option value="all">👥 Any player count</option>
              <option value="2">2 Players</option>
              <option value="3-4">3–4 Players</option>
              <option value="5+">5+ Players</option>
            </select>

            {/* Complexity Weight Filter */}
            <select
              className="collection-select"
              value={weightFilter}
              onChange={(e) => setWeightFilter(e.target.value as WeightFilter)}
              aria-label="Filter by complexity weight"
            >
              <option value="all">⚖️ Any complexity</option>
              <option value="light">Light (≤ 2.2)</option>
              <option value="medium">Medium (2.2–3.5)</option>
              <option value="heavy">Heavy (&gt; 3.5)</option>
            </select>

            {/* Shared with Groups Filter */}
            <select
              className="collection-select"
              value={sharedFilter}
              onChange={(e) => setSharedFilter(e.target.value as SharedFilter)}
              aria-label="Filter by group sharing"
            >
              <option value="all">🌐 All sharing</option>
              <option value="shared">Shared with a group</option>
              <option value="unshared">Not shared yet</option>
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="collection-select-group">
            <label htmlFor="collection-sort" style={{ fontSize: "13px", fontWeight: 700 }}>
              Sort:
            </label>
            <select
              id="collection-sort"
              className="collection-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="name-asc">Title: A → Z</option>
              <option value="name-desc">Title: Z → A</option>
              <option value="weight-desc">Complexity: High → Low</option>
              <option value="weight-asc">Complexity: Low → High</option>
              <option value="time-asc">Play time: Shortest</option>
              <option value="year-desc">Year: Newest</option>
              <option value="recent">Recently Added</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="state-message error" role="alert">
          <p>{error}</p>
          <button className="button-quiet" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {games.length === 0 ? (
        <div className="empty-state">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h2>Your shelf is ready for its first game.</h2>
            <p>Search above or sync your BoardGameGeek collection. You can share games with a group afterward.</p>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <div>
            <h2>No games match your filters.</h2>
            <p>Try clearing your search query or adjusting your filters.</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setSearchQuery("");
                setFilter("all");
                setPlayerFilter("all");
                setWeightFilter("all");
                setSharedFilter("all");
              }}
            >
              Reset all filters
            </button>
          </div>
        </div>
      ) : (
        <div className="game-grid">
          {shown.map((game) => (
            <div className="collection-card-wrap" key={game.bggId}>
              <GameCard
                game={game}
                actions={
                  <div className="game-actions">
                    <button
                      type="button"
                      className={`button-quiet ${!game.isAvailable ? "status-flag" : ""}`}
                      onClick={() => {
                        setEditingId(editingId === game.bggId ? null : game.bggId);
                        setSharingId(null);
                      }}
                    >
                      {game.isAvailable ? "✓ Available" : `⚠ ${game.unavailableReason || "Unavailable"}`}
                    </button>
                    <button
                      type="button"
                      className="button-quiet"
                      onClick={() => {
                        setSharingId(sharingId === game.bggId ? null : game.bggId);
                        setEditingId(null);
                      }}
                    >
                      Share ({game.sharedGroupIds.length})
                    </button>
                    <button
                      type="button"
                      className="button-quiet"
                      onClick={() => setConfirmId(game.bggId)}
                    >
                      Remove
                    </button>
                  </div>
                }
              />

              {/* Modern Availability & Version Editor */}
              {editingId === game.bggId && (
                <div className="availability-panel panel">
                  <div className="availability-header">
                    <h4>Availability & Edition</h4>
                    <button
                      type="button"
                      className="button-quiet button-small"
                      onClick={() => setEditingId(null)}
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div className="availability-toggle-row">
                    <label className="toggle-switch-label">
                      <span className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={game.isAvailable}
                          onChange={(e) =>
                            void updateAvailability(
                              game.bggId,
                              e.target.checked,
                              e.target.checked ? null : (game.unavailableReason || "Lent out"),
                              game.versionName
                            )
                          }
                        />
                        <span className="toggle-slider"></span>
                      </span>
                      <span>
                        {game.isAvailable
                          ? "✓ Available to bring to Game Nights"
                          : "⚠ Kept at home (Unavailable to travel)"}
                      </span>
                    </label>
                  </div>

                  {!game.isAvailable && (
                    <div className="field reason-field">
                      <label htmlFor={`reason-${game.bggId}`}>Reason if unavailable</label>
                      <select
                        id={`reason-${game.bggId}`}
                        value={game.unavailableReason || "Lent out"}
                        onChange={(e) =>
                          void updateAvailability(
                            game.bggId,
                            false,
                            e.target.value,
                            game.versionName
                          )
                        }
                      >
                        <option value="Lent out">Lent out to a friend</option>
                        <option value="Too heavy to transport">Too heavy to transport</option>
                        <option value="Home only">Home only (play at my place)</option>
                        <option value="Missing pieces">Missing pieces / under repair</option>
                        <option value="Not ready to play">Not ready to play / unpunched</option>
                      </select>
                    </div>
                  )}

                  <div className="field version-field">
                    <label htmlFor={`version-${game.bggId}`}>Specific Edition / Version Name</label>
                    <input
                      id={`version-${game.bggId}`}
                      type="text"
                      placeholder="e.g. 25th Anniversary, 2nd Edition, Deluxe Kickstarter"
                      defaultValue={game.versionName || ""}
                      onBlur={(e) =>
                        void updateAvailability(
                          game.bggId,
                          game.isAvailable,
                          game.unavailableReason,
                          e.target.value.trim() || null
                        )
                      }
                    />
                  </div>
                </div>
              )}

              {/* Modern Group Share Panel */}
              {sharingId === game.bggId && (
                <ShareControl
                  bggId={game.bggId}
                  gameName={game.name}
                  sharedGroupIds={game.sharedGroupIds}
                  groups={groups}
                  onChanged={() => void load()}
                  onClose={() => setSharingId(null)}
                />
              )}

              {confirmId === game.bggId && (
                <div className="confirm-strip">
                  <span>
                    Remove {game.name}? This also stops sharing your copy with{" "}
                    {game.sharedGroupIds.length}{" "}
                    {game.sharedGroupIds.length === 1 ? "group" : "groups"}.
                  </span>
                  <button
                    className="button-danger button-small"
                    disabled={removingId !== null}
                    onClick={() => void removeGame(game.bggId)}
                  >
                    {removingId === game.bggId ? "Removing…" : "Remove game"}
                  </button>
                  <button
                    className="button-secondary button-small"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
