"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UserVotingSummary } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { useApi } from "@/lib/api";
import {
  queryKeys,
  useGroupDetailQuery,
  useGroupGamesQuery,
  useGroupInterestQuery,
} from "@/lib/queries";

type GroupKindFilter = "base" | "all" | "voted" | "available" | "expansions";
type GroupSortOption = "votes-desc" | "name-asc" | "name-desc" | "weight-desc" | "weight-asc" | "time-asc" | "year-desc";
type PlayerFilter = "all" | "2" | "3-4" | "5+";
type WeightFilter = "all" | "light" | "medium" | "heavy";

export function GroupClient() {
  const tVoting = useTranslations("groupVoting");
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data: groupData, isLoading: groupLoading, error: groupQueryError } = useGroupDetailQuery(groupId);
  const { data: gamesData, isLoading: gamesLoading } = useGroupGamesQuery(groupId);
  const { data: interestData } = useGroupInterestQuery(groupId);

  const group = groupData?.group ?? null;
  const games = gamesData?.games ?? [];
  const votingSummary: UserVotingSummary | null = interestData?.summary ?? null;

  const [error, setError] = useState("");
  const [votingBggId, setVotingBggId] = useState<number | null>(null);

  const refreshGroup = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(groupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.groupGames(groupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.groupInterest(groupId) }),
    ]);
  }, [groupId, queryClient]);

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<GroupKindFilter>("base");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const [weightFilter, setWeightFilter] = useState<WeightFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<GroupSortOption>("votes-desc");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  const sharingMembers = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of games) {
      for (const o of g.owners) {
        map.set(o.userId, o.displayName);
      }
    }
    return Array.from(map.entries())
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [games]);

  const shown = useMemo(() => {
    let list = [...games];

    // 1. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.baseGameTitle && g.baseGameTitle.toLowerCase().includes(q)) ||
          g.designers.some((d) => d.toLowerCase().includes(q)) ||
          g.owners.some((o) => o.displayName.toLowerCase().includes(q))
      );
    }

    // 2. View Mode (Grouped under Base Game vs Flat view)
    const groupBaseGameIds = new Set(
      games.filter((g) => g.kind !== "boardgameexpansion").map((g) => g.bggId)
    );
    if (viewMode === "grouped" && kindFilter !== "expansions") {
      list = list.filter((g) => {
        if (g.kind !== "boardgameexpansion") return true;
        if (g.isStandalone) return true;
        if (g.baseGameBggId && !groupBaseGameIds.has(g.baseGameBggId)) return true;
        return false;
      });
    }

    // 3. Kind & Availability
    if (kindFilter === "base") {
      list = list.filter((g) => g.kind !== "boardgameexpansion" || g.isStandalone);
    } else if (kindFilter === "expansions") {
      list = list.filter((g) => g.kind === "boardgameexpansion");
    } else if (kindFilter === "voted") {
      list = list.filter((g) => (g.interestScore ?? 0) > 0);
    } else if (kindFilter === "available") {
      list = list.filter((g) => g.owners.some((o) => o.isAvailable !== false));
    }

    // 3. Player Count Filter (taking into account effective max players with expansions)
    if (playerFilter === "2") {
      list = list.filter((g) => (g.minPlayers ?? 0) <= 2 && (g.effectiveMaxPlayers ?? g.maxPlayers ?? 0) >= 2);
    } else if (playerFilter === "3-4") {
      list = list.filter((g) => (g.minPlayers ?? 0) <= 4 && (g.effectiveMaxPlayers ?? g.maxPlayers ?? 0) >= 3);
    } else if (playerFilter === "5+") {
      list = list.filter((g) => (g.effectiveMaxPlayers ?? g.maxPlayers ?? 0) >= 5);
    }

    // 4. Weight / Complexity Filter
    if (weightFilter === "light") {
      list = list.filter((g) => g.weight !== null && g.weight <= 2.2);
    } else if (weightFilter === "medium") {
      list = list.filter((g) => g.weight !== null && g.weight > 2.2 && g.weight <= 3.5);
    } else if (weightFilter === "heavy") {
      list = list.filter((g) => g.weight !== null && g.weight > 3.5);
    }

    // 5. Owner Member Filter
    if (ownerFilter !== "all") {
      list = list.filter((g) => g.owners.some((o) => o.userId === ownerFilter));
    }

    // 6. Sorting
    list.sort((a, b) => {
      if (sortBy === "votes-desc") {
        const diff = (b.interestScore ?? 0) - (a.interestScore ?? 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      if (sortBy === "weight-desc") return (b.weight ?? 0) - (a.weight ?? 0);
      if (sortBy === "weight-asc") return (a.weight ?? 99) - (b.weight ?? 99);
      if (sortBy === "time-asc") return (a.playingTime ?? 999) - (b.playingTime ?? 999);
      if (sortBy === "year-desc") return (b.yearPublished ?? 0) - (a.yearPublished ?? 0);
      return 0;
    });

    return list;
  }, [games, searchQuery, kindFilter, playerFilter, weightFilter, ownerFilter, sortBy]);

  async function handleVote(bggId: number) {
    if (!votingSummary || votingSummary.availablePoints <= 0) {
      alert("You have no voting points remaining right now. Check back next week to earn more points!");
      return;
    }
    const currentVote = games.find((g) => g.bggId === bggId)?.userVotedPoints ?? 0;
    try {
      setVotingBggId(bggId);
      await api(`/v1/groups/${groupId}/interest`, {
        method: "POST",
        body: JSON.stringify({ bggId, points: currentVote + 1 }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.groupGames(groupId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.groupInterest(groupId) }),
      ]);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Failed to cast vote.");
    } finally {
      setVotingBggId(null);
    }
  }

  const loading = !isLoaded || (isSignedIn && (groupLoading || gamesLoading));
  if (loading) return <div className="page"><p className="loading">Loading group…</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Sign in to see this group.</h1>
        <Link href="/sign-in" className="button">Sign in</Link>
      </section>
    );
  }

  if (error || (!groupLoading && !group)) {
    return (
      <section className="narrow-page">
        <div className="state-message error" role="alert">
          <p>{error || (groupQueryError instanceof Error ? groupQueryError.message : "") || "Group not found."}</p>
          <button className="button-quiet" onClick={() => void refreshGroup()}>Try again</button>
        </div>
      </section>
    );
  }

  if (!group) return null;

  return (
    <div className="page">
      <Link href="/groups" className="back-link">← All groups</Link>
      <div className="page-header">
        <div>
          <h1>{group.name}</h1>
          <p>
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {games.length}{" "}
            {games.length === 1 ? "game" : "games"} ready to consider
          </p>
        </div>
        <div className="page-actions">
          <Link className="button-secondary" href={`/groups/${groupId}/events`}>📅 Events & RSVPs</Link>
          <Link className="button-secondary" href={`/groups/${groupId}/members`}>Members</Link>
          <Link className="button" href={`/groups/${groupId}/game-night`}>Quick Pick</Link>
        </div>
      </div>

      {/* Want to play voting banner */}
      {votingSummary && (
        <div className="panel voting-banner">
          <div className="panel-header">
            <div>
              <h3>{tVoting("title")}</h3>
              <p>
                {tVoting("description")}
              </p>
            </div>
            <div
              className="voting-points-badge"
              title={tVoting("badgeTooltip")}
            >
              {tVoting("badgeText", {
                available: votingSummary.availablePoints,
                used: votingSummary.usedPoints,
              })}
            </div>
          </div>
        </div>
      )}

      <div className="section-title">
        <div>
          <h2>Shared games</h2>
          <p>
            Showing {shown.length} of {games.length} {games.length === 1 ? "game" : "games"} across all members
          </p>
        </div>
      </div>

      {games.length === 0 ? (
        <div className="empty-state">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h2>No games on this table yet.</h2>
            <p>Members can share games from their own collections.</p>
            <Link className="text-link" href="/collection">Go to my collection</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Group Search & Filter Toolbar */}
          <div className="collection-toolbar">
            {/* Search Bar */}
            <div className="collection-search-wrap">
              <span className="collection-search-icon">🔍</span>
              <input
                type="search"
                className="collection-search-input"
                placeholder={`Search ${games.length} group games by title, owner, or designer…`}
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

            {/* Kind & Status Count Chips */}
            <div className="count-filters" role="group" aria-label="Filter group games">
              {[
                { id: "base", label: "Base games", count: games.filter((g) => g.kind !== "boardgameexpansion" || g.isStandalone).length },
                { id: "all", label: "All items", count: games.length },
                { id: "voted", label: "⭐ Wishlist voted", count: games.filter((g) => (g.interestScore ?? 0) > 0).length },
                { id: "available", label: "Available to bring", count: games.filter((g) => g.owners.some((o) => o.isAvailable !== false)).length },
                ...(games.some((g) => g.kind === "boardgameexpansion")
                  ? [{ id: "expansions", label: "Expansions only", count: games.filter((g) => g.kind === "boardgameexpansion").length }]
                  : []),
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`count-filter ${kindFilter === item.id ? "active" : ""}`}
                  aria-pressed={kindFilter === item.id}
                  onClick={() => setKindFilter(item.id as GroupKindFilter)}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            {/* Selectors Row */}
            <div className="collection-filters-row">
              <div className="collection-select-group">
                {/* Player count */}
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

                {/* Complexity */}
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

                {/* Member / Owner filter */}
                {sharingMembers.length > 1 && (
                  <select
                    className="collection-select"
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                    aria-label="Filter by member"
                  >
                    <option value="all">👤 All members</option>
                    {sharingMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        👤 {m.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Sort selector & View Mode */}
              <div className="collection-select-group">
                <div className="view-mode-toggle" role="group" aria-label="Expansions view mode">
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "grouped" ? "active" : ""}`}
                    onClick={() => setViewMode("grouped")}
                    title="Group expansions under base games"
                  >
                    🧩 Grouped
                  </button>
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "flat" ? "active" : ""}`}
                    onClick={() => setViewMode("flat")}
                    title="Show all individual expansion cards"
                  >
                    📄 All boxes
                  </button>
                </div>

                <label htmlFor="group-sort" style={{ fontSize: "13px", fontWeight: 700 }}>
                  Sort:
                </label>
                <select
                  id="group-sort"
                  className="collection-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as GroupSortOption)}
                >
                  <option value="votes-desc">⭐ Most wanted / voted</option>
                  <option value="name-asc">Title: A → Z</option>
                  <option value="name-desc">Title: Z → A</option>
                  <option value="weight-desc">Complexity: High → Low</option>
                  <option value="weight-asc">Complexity: Low → High</option>
                  <option value="time-asc">Play time: Shortest</option>
                  <option value="year-desc">Year: Newest</option>
                </select>
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="state-message" style={{ margin: "24px 0", textAlign: "center" }}>
              <p>No games match your current filter selection.</p>
              <button
                type="button"
                className="button-quiet"
                style={{ marginTop: "10px" }}
                onClick={() => {
                  setSearchQuery("");
                  setKindFilter("base");
                  setPlayerFilter("all");
                  setWeightFilter("all");
                  setOwnerFilter("all");
                }}
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="game-grid">
              {shown.map((game) => (
                <GameCard
                  key={game.bggId}
                  game={game}
                  owners={game.owners}
                  interestScore={game.interestScore}
                  canVote={votingSummary ? votingSummary.availablePoints > 0 : false}
                  onVote={() => void handleVote(game.bggId)}
                  actions={
                    votingSummary && (
                      <button
                        type="button"
                        className="button-quiet button-small"
                        disabled={votingBggId === game.bggId || votingSummary.availablePoints <= 0}
                        onClick={() => void handleVote(game.bggId)}
                      >
                        ⭐ Vote ({game.userVotedPoints ?? 0})
                      </button>
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
