"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { BggSyncResult } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { GameSearch } from "@/components/game-search";
import { ShareControl } from "@/components/share-control";
import { useApi } from "@/lib/api";
import { queryKeys, useCollectionQuery, useGroupsQuery, useBggProfileQuery } from "@/lib/queries";
import { useAutoEnrich } from "@/lib/use-auto-enrich";

type Filter = "all" | "boardgame" | "boardgameexpansion" | "available" | "unavailable" | "expanded";
type SortOption = "name-asc" | "name-desc" | "weight-desc" | "weight-asc" | "time-asc" | "year-desc" | "recent";
type PlayerFilter = "all" | "2" | "3-4" | "5+";
type WeightFilter = "all" | "light" | "medium" | "heavy";
type SharedFilter = "all" | "shared" | "unshared";

export function CollectionClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const t = useTranslations("collection");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");

  function formatReason(raw: string | null | undefined): string {
    if (!raw) return t("homeOnlyReason");
    switch (raw) {
      case "In storage":
      case "Guardado en almacén":
        return t("inStorage");
      case "Lent out":
      case "Prestado a un amigo":
        return t("lentOut");
      case "Too heavy to transport":
      case "Demasiado pesado para transportar":
        return t("tooHeavy");
      case "Home only":
      case "Solo en casa (jugar en mi casa)":
        return t("homeOnlyReason");
      case "Missing pieces":
      case "Piezas faltantes / en reparación":
        return t("missingPieces");
      case "Not ready to play":
      case "No listo para jugar / sin destroquelar":
        return t("notReadyToPlay");
      case "At another location / in transit":
      case "En otra casa / en tránsito":
        return t("inTransit");
      case "Needs sleeving / organizing":
      case "Pendiente de enfundar u organizar":
        return t("needsOrganizing");
      default:
        return raw;
    }
  }

  const standardReasons = [
    { value: "In storage", label: t("inStorage") },
    { value: "Lent out", label: t("lentOut") },
    { value: "Too heavy to transport", label: t("tooHeavy") },
    { value: "Home only", label: t("homeOnlyReason") },
    { value: "Missing pieces", label: t("missingPieces") },
    { value: "Not ready to play", label: t("notReadyToPlay") },
    { value: "At another location / in transit", label: t("inTransit") },
    { value: "Needs sleeving / organizing", label: t("needsOrganizing") },
  ];

  const { data: collectionData, isLoading: collectionLoading, error: collectionError } = useCollectionQuery();
  const { data: groupsData, isLoading: groupsLoading } = useGroupsQuery();
  const { data: bggProfileData } = useBggProfileQuery();

  const games = collectionData?.games ?? [];
  const groups = groupsData?.groups ?? [];
  const { isAutoEnriching } = useAutoEnrich(games);
  const [error, setError] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const [weightFilter, setWeightFilter] = useState<WeightFilter>("all");
  const [sharedFilter, setSharedFilter] = useState<SharedFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  // Interaction Modals / Panels
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const inspectorRef = useRef<HTMLDialogElement>(null);

  // BGG Sync & Enrich State
  const [bggUsername, setBggUsername] = useState("");
  const [savedBggUsername, setSavedBggUsername] = useState<string | null>(null);
  const [lastBggSyncAt, setLastBggSyncAt] = useState<string | null>(null);
  const [editingBggUser, setEditingBggUser] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("tablefolk_bgg_user");
      if (cached) {
        setSavedBggUsername(cached);
        setBggUsername(cached);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (bggProfileData?.bggUsername) {
      setSavedBggUsername(bggProfileData.bggUsername);
      setBggUsername((prev) => prev || bggProfileData.bggUsername || "");
      setLastBggSyncAt(bggProfileData.lastBggSyncAt);
      try { localStorage.setItem("tablefolk_bgg_user", bggProfileData.bggUsername); } catch {}
    }
  }, [bggProfileData]);

  const refreshCollection = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.collection }),
      queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
      queryClient.invalidateQueries({ queryKey: queryKeys.bggProfile }),
    ]);
  }, [queryClient]);

  const selectedId = sharingId ?? editingId;
  const selectedGame = games.find((game) => game.bggId === selectedId);

  useEffect(() => {
    const inspector = inspectorRef.current;
    if (!inspector) return;
    if (selectedGame && !inspector.open) inspector.showModal();
    if (!selectedGame && inspector.open) inspector.close();
  }, [selectedGame]);

  function closeInspector() {
    setSharingId(null);
    setEditingId(null);
    setConfirmId(null);
  }

  function openInspector(bggId: number, section: "share" | "details") {
    setSharingId(section === "share" ? bggId : null);
    setEditingId(section === "details" ? bggId : null);
    setConfirmId(null);
  }

  async function removeGame(bggId: number) {
    setRemovingId(bggId);
    try {
      await api(`/v1/collection/${bggId}`, { method: "DELETE" });
      setConfirmId(null);
      setSharingId(null);
      await refreshCollection();
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
    versionName?: string | null,
    maxPlayersOverride?: number | null,
    isStandalone?: boolean
  ) {
    try {
      await api(`/v1/collection/${bggId}`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable, unavailableReason, versionName, maxPlayersOverride, isStandalone }),
      });
      await refreshCollection();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update availability.");
    }
  }

  async function handleSyncBgg(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const targetUser = (bggUsername || savedBggUsername || "").trim();
    if (!targetUser) return;
    setSyncing(true);
    setSyncStatus("Connecting to BoardGameGeek and syncing collection…");
    setError("");

    try {
      if (targetUser !== savedBggUsername) {
        await api("/v1/user/bgg-profile", {
          method: "PUT",
          body: JSON.stringify({ bggUsername: targetUser }),
        });
        setSavedBggUsername(targetUser);
        setEditingBggUser(false);
        try { localStorage.setItem("tablefolk_bgg_user", targetUser); } catch {}
      }

      const res = await api<BggSyncResult>("/v1/collection/sync-bgg", {
        method: "POST",
      });

      setSyncStatus(`Sync complete! ${res.importedCount} new games added, ${res.updatedCount} updated.`);
      await refreshCollection();
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
          `Successfully cached and enriched ${res.enrichedCount} games! ${
            res.remainingCount > 0
              ? `(${res.remainingCount} more pending)`
              : "All games are fully enriched and cached in Tablefolk."
          }`
        );
        await refreshCollection();
      } else {
        setEnrichStatus("All your games are already fully cached and enriched in Tablefolk!");
      }
    } catch (cause) {
      setEnrichStatus(cause instanceof Error ? cause.message : "Could not complete enrichment.");
    } finally {
      setEnriching(false);
    }
  }

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // Pending enrichment count (missing complexity weight, rating, rank, bestPlayers, OR not yet cached locally in Tablefolk,
  // excluding games refreshed within the last 7 days so items without weight/cover on BGG aren't stuck forever)
  const pendingEnrichmentCount = useMemo(() => {
    const now = Date.now();
    return games.filter((g) => {
      const missingData =
        g.weight === null ||
        g.rating === null ||
        g.rating === undefined ||
        g.rank === null ||
        g.rank === undefined ||
        g.bestPlayers === null ||
        g.bestPlayers === undefined ||
        !g.coverUrl ||
        !g.coverUrl.startsWith("/v1/covers/");

      if (!missingData) {
        if (!g.lastEnrichedAt) return true;
        const enrichedAt = new Date(g.lastEnrichedAt).getTime();
        return now - enrichedAt > SEVEN_DAYS_MS;
      }

      if (g.lastEnrichedAt) {
        const enrichedAt = new Date(g.lastEnrichedAt).getTime();
        if (now - enrichedAt < SEVEN_DAYS_MS) {
          return false;
        }
      }

      return true;
    }).length;
  }, [games]);

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
          (g.baseGameTitle && g.baseGameTitle.toLowerCase().includes(q)) ||
          g.designers.some((d) => d.toLowerCase().includes(q))
      );
    }

    // 2. View Mode (Grouped under Base Game vs Flat view)
    const ownedBaseGameIds = new Set(
      games.filter((g) => g.kind !== "boardgameexpansion").map((g) => g.bggId)
    );
    if (viewMode === "grouped" && filter !== "boardgameexpansion") {
      list = list.filter((g) => {
        if (g.kind !== "boardgameexpansion") return true;
        if (g.isStandalone) return true;
        // Keep orphan expansions whose base game is not in the collection
        if (g.baseGameBggId && !ownedBaseGameIds.has(g.baseGameBggId)) return true;
        return false;
      });
    }

    // 3. Kind & Availability
    if (filter === "available") {
      list = list.filter((g) => g.isAvailable);
    } else if (filter === "unavailable") {
      list = list.filter((g) => !g.isAvailable);
    } else if (filter === "boardgame" || filter === "boardgameexpansion") {
      list = list.filter((g) => g.kind === filter);
    } else if (filter === "expanded") {
      list = list.filter((g) => (g.effectiveMaxPlayers ?? 0) > (g.maxPlayers ?? 0) || (g.expansionCount ?? 0) > 0);
    }

    // 3. Player Count (takes into account effective max players from expansions)
    if (playerFilter === "2") {
      list = list.filter((g) => (g.minPlayers ?? 0) <= 2 && (g.effectiveMaxPlayers ?? g.maxPlayers ?? 0) >= 2);
    } else if (playerFilter === "3-4") {
      list = list.filter((g) => (g.minPlayers ?? 0) <= 4 && (g.effectiveMaxPlayers ?? g.maxPlayers ?? 0) >= 3);
    } else if (playerFilter === "5+") {
      list = list.filter((g) => (g.effectiveMaxPlayers ?? g.maxPlayers ?? 0) >= 5);
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

  const loading = !isLoaded || (isSignedIn && (collectionLoading || groupsLoading));
  if (loading) return <div className="page"><p className="loading">{tCommon("loading")}</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>{t("unauthTitle")}</h1>
        <p>{t("unauthSubtitle")}</p>
        <Link href="/sign-in" className="button">{tNav("signIn")}</Link>
      </section>
    );
  }

  const game = selectedGame;

  return (
    <div className="page collection-page">
      <div className="page-header collection-heading">
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <Link href="/groups" className="collection-groups-link">{t("viewGroups")}</Link>
      </div>

      <div className="collection-tools">
        <details className="collection-tool collection-tool-add">
          <summary>{t("addGame")}</summary>
          <div className="collection-tool-content"><GameSearch onAdded={() => void refreshCollection()} /></div>
        </details>
        <details className="collection-tool">
          <summary>
            {savedBggUsername ? `BoardGameGeek (@${savedBggUsername})` : t("bggImportTitle")}
          </summary>
          <div className="collection-tool-content">
            {savedBggUsername && !editingBggUser ? (
              <div className="bgg-connected-card">
                <div className="bgg-connected-header">
                  <span className="bgg-status-dot" aria-hidden="true">●</span>
                  <div>
                    <strong>{t("bggConnected", { username: savedBggUsername })}</strong>
                    {lastBggSyncAt && (
                      <span className="bgg-last-sync">
                        {" "}· {t("bggLastSynced", { date: new Date(lastBggSyncAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })}
                      </span>
                    )}
                  </div>
                </div>
                <p>{t("bggSubtitle")}</p>
                <div className="bgg-connected-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void handleSyncBgg()}
                    disabled={syncing}
                  >
                    {syncing ? t("bggSyncing") : t("bggSyncNow")}
                  </button>
                  <button
                    type="button"
                    className="button-quiet button-small"
                    onClick={() => setEditingBggUser(true)}
                    disabled={syncing}
                  >
                    {t("bggChangeUser")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p>{t("bggConnectPrompt")}</p>
                <form onSubmit={handleSyncBgg} className="inline-form">
                  <div className="field">
                    <label htmlFor="bgg-user">{t("bggUsernameLabel")}</label>
                    <input
                      id="bgg-user"
                      type="text"
                      placeholder="e.g. Rahdo"
                      value={bggUsername}
                      onChange={(e) => setBggUsername(e.target.value)}
                      disabled={syncing}
                      autoFocus={editingBggUser}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                    <button type="submit" className="button" disabled={syncing || !bggUsername.trim()}>
                      {syncing ? t("bggConnecting") : savedBggUsername ? t("bggSaveAndSync") : t("bggConnectAndSync")}
                    </button>
                    {savedBggUsername && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          setBggUsername(savedBggUsername);
                          setEditingBggUser(false);
                        }}
                        disabled={syncing}
                      >
                        {tCommon("cancel")}
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
            {syncStatus && <p className="form-success">{syncStatus}</p>}
          </div>
        </details>
        {(pendingEnrichmentCount > 0 || enrichStatus || isAutoEnriching) && (
          <details className="collection-tool">
            <summary>
              {isAutoEnriching
                ? `🔄 ${t("refreshingBackground")}`
                : pendingEnrichmentCount > 0
                ? t("refreshPending", { count: pendingEnrichmentCount })
                : t("refreshDetails")}
            </summary>
            <div className="collection-tool-content">
              <p>{t("enrichDesc")}</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void handleEnrich()}
                disabled={enriching || isAutoEnriching || pendingEnrichmentCount === 0}
              >
                {enriching || isAutoEnriching ? t("refreshing") : t("refreshDetails")}
              </button>
              {enrichStatus && <p className="form-success" role="status">{enrichStatus}</p>}
            </div>
          </details>
        )}
      </div>

      <div className="section-title">
        <h2>{t("yourGames")}</h2>
        <p>
          {t("showingCount", { shown: shown.length, total: games.length })}
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
            placeholder={t("filterPlaceholder", { count: games.length })}
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
              { id: "all", label: t("filters.all"), count: games.length },
              { id: "available", label: t("filters.available"), count: games.filter((g) => g.isAvailable).length },
              { id: "unavailable", label: t("filters.unavailable"), count: games.filter((g) => !g.isAvailable).length },
              { id: "boardgame", label: t("filters.boardgame"), count: games.filter((g) => g.kind === "boardgame").length },
              { id: "boardgameexpansion", label: t("filters.expansion"), count: games.filter((g) => g.kind === "boardgameexpansion").length },
              {
                id: "expanded",
                label: t("hasExpansions"),
                count: games.filter((g) => (g.effectiveMaxPlayers ?? 0) > (g.maxPlayers ?? 0) || (g.expansionCount ?? 0) > 0).length,
              },
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
              <option value="all">{t("anyPlayerCount")}</option>
              <option value="2">{t("playersCount", { count: 2 })}</option>
              <option value="3-4">3–4 {t("playersCount", { count: 4 }).split(" ")[1]}</option>
              <option value="5+">{t("playersFivePlus")}</option>
            </select>

            {/* Complexity Weight Filter */}
            <select
              className="collection-select"
              value={weightFilter}
              onChange={(e) => setWeightFilter(e.target.value as WeightFilter)}
              aria-label="Filter by complexity weight"
            >
              <option value="all">{t("complexity.all")}</option>
              <option value="light">{t("complexity.light")}</option>
              <option value="medium">{t("complexity.medium")}</option>
              <option value="heavy">{t("complexity.heavy")}</option>
            </select>

            {/* Shared with Groups Filter */}
            <select
              className="collection-select"
              value={sharedFilter}
              onChange={(e) => setSharedFilter(e.target.value as SharedFilter)}
              aria-label="Filter by group sharing"
            >
              <option value="all">{t("allSharing")}</option>
              <option value="shared">{t("sharedWithGroup")}</option>
              <option value="unshared">{t("notSharedYet")}</option>
            </select>
          </div>

          {/* Sort By Dropdown & View Mode */}
          <div className="collection-select-group">
            <div className="view-mode-toggle" role="group" aria-label="Expansions view mode">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === "grouped" ? "active" : ""}`}
                onClick={() => setViewMode("grouped")}
                title={t("viewModeGrouped")}
              >
                {t("viewModeGrouped")}
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === "flat" ? "active" : ""}`}
                onClick={() => setViewMode("flat")}
                title={t("viewModeFlat")}
              >
                {t("viewModeFlat")}
              </button>
            </div>

            <label htmlFor="collection-sort" style={{ fontSize: "13px", fontWeight: 700 }}>
              {t("sortLabel")}
            </label>
            <select
              id="collection-sort"
              className="collection-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="name-asc">{t("sort.nameAsc")}</option>
              <option value="name-desc">{t("sort.nameDesc")}</option>
              <option value="weight-desc">{t("sort.weightDesc")}</option>
              <option value="weight-asc">{t("sort.weightAsc")}</option>
              <option value="time-asc">{t("sort.timeAsc")}</option>
              <option value="year-desc">{t("sort.yearDesc")}</option>
              <option value="recent">{t("sort.recent")}</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="state-message error" role="alert">
          <p>{error}</p>
          <button className="button-quiet" onClick={() => void refreshCollection()}>{tCommon("confirm")}</button>
        </div>
      )}

      {games.length === 0 ? (
        <div className="empty-state">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h2>{t("emptyShelfTitle")}</h2>
            <p>{t("emptyShelfDesc")}</p>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <div>
            <h2>{t("noGamesMatchedTitle")}</h2>
            <p>{t("noGamesMatchedDesc")}</p>
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
              {t("resetAllFilters")}
            </button>
          </div>
        </div>
      ) : (
        <div className="game-grid collection-grid">
          {shown.map((game, index) => (
            <div className="collection-card-wrap" key={game.bggId}>
              <GameCard
                game={game}
                eagerCover={index === 0}
                actions={
                  <div className="collection-card-actions">
                    <button
                      type="button"
                      className="collection-action"
                      onClick={() => openInspector(game.bggId, "share")}
                      aria-label={`${t("shareAction")} ${game.name}`}
                    >
                      {t("shareAction")} {game.sharedGroupIds.length > 0 && <span>{game.sharedGroupIds.length}</span>}
                    </button>
                    <button
                      type="button"
                      className="collection-action"
                      onClick={() => openInspector(game.bggId, "details")}
                      aria-label={`${t("manageAction")} ${game.name}`}
                    >
                      {t("manageAction")}
                    </button>
                  </div>
                }
              />
              <span className={`collection-status ${game.isAvailable ? "" : "collection-status-unavailable"}`}>
                {game.isAvailable ? t("availableToTravel") : formatReason(game.unavailableReason)}
              </span>
            </div>
          ))}
        </div>
      )}

      <dialog
        ref={inspectorRef}
        className="collection-inspector"
        aria-label={game ? `${t("manageAction")} ${game.name}` : t("manageAction")}
        onClose={closeInspector}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.target === event.currentTarget &&
              (event.clientX < bounds.left || event.clientX > bounds.right ||
               event.clientY < bounds.top || event.clientY > bounds.bottom)) {
            event.currentTarget.close();
          }
        }}
      >
        {game && (
          <div className="collection-inspector-inner">
            <div className="collection-inspector-head">
              <div>
                <h2>{game.name}</h2>
                <p>{game.isAvailable ? t("availableToTravel") : formatReason(game.unavailableReason)}</p>
              </div>
              <button type="button" className="collection-close" onClick={() => inspectorRef.current?.close()} aria-label={t("close")}>{t("close")}</button>
            </div>
            <div className="collection-inspector-tabs" role="group" aria-label="Game settings">
              <button type="button" className={sharingId === game.bggId ? "active" : ""} aria-pressed={sharingId === game.bggId} onClick={() => openInspector(game.bggId, "share")}>{t("shareAction")}</button>
              <button type="button" className={editingId === game.bggId ? "active" : ""} aria-pressed={editingId === game.bggId} onClick={() => openInspector(game.bggId, "details")}>{tCommon("details")}</button>
            </div>

            {sharingId === game.bggId ? (
              <section className="collection-inspector-section">
                <h3>{t("shareWithGroups")}</h3>
                <ShareControl
                  bggId={game.bggId}
                  sharedGroupIds={game.sharedGroupIds}
                  groups={groups}
                  onChanged={() => void refreshCollection()}
                />
              </section>
            ) : (
              <section className="collection-inspector-section">
                <h3>{t("availabilityAndVersion")}</h3>
                  <div className="field">
                    <label>
                      <input
                        type="checkbox"
                        checked={game.isAvailable}
                        onChange={(e) =>
                          void updateAvailability(
                            game.bggId,
                            e.target.checked,
                            e.target.checked ? null : (game.unavailableReason || "In storage"),
                            game.versionName
                          )
                        }
                      />
                      {" "}{t("availableToBring")}
                    </label>
                  </div>

                  {!game.isAvailable && (
                    <div className="field reason-field">
                      <label htmlFor={`reason-${game.bggId}`}>{t("reasonIfUnavailable")}</label>
                      <select
                        id={`reason-${game.bggId}`}
                        value={standardReasons.some((r) => r.value === (game.unavailableReason || "In storage")) ? (game.unavailableReason || "In storage") : "__custom__"}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__custom__") {
                            void updateAvailability(game.bggId, false, "Custom", game.versionName);
                          } else {
                            void updateAvailability(game.bggId, false, val, game.versionName);
                          }
                        }}
                      >
                        {standardReasons.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                        <option value="__custom__">{t("otherReason")}</option>
                      </select>
                      {(!standardReasons.some((r) => r.value === game.unavailableReason) && Boolean(game.unavailableReason)) && (
                        <input
                          type="text"
                          style={{ marginTop: "8px" }}
                          placeholder={t("customReasonPlaceholder")}
                          defaultValue={game.unavailableReason === "Custom" ? "" : (game.unavailableReason || "")}
                          onBlur={(e) => {
                            const customVal = e.target.value.trim() || "In storage";
                            void updateAvailability(game.bggId, false, customVal, game.versionName);
                          }}
                        />
                      )}
                    </div>
                  )}

                  <div className="field version-field">
                    <label htmlFor={`version-${game.bggId}`}>{t("editionVersionLabel")}</label>
                    <input
                      key={game.bggId}
                      id={`version-${game.bggId}`}
                      type="text"
                      placeholder="e.g. 25th Anniversary, 2nd Edition, Deluxe Kickstarter"
                      defaultValue={game.versionName || ""}
                      onBlur={(e) =>
                        void updateAvailability(
                          game.bggId,
                          game.isAvailable,
                          game.unavailableReason,
                          e.target.value.trim() || null,
                          game.maxPlayersOverride
                        )
                      }
                    />
                  </div>
                  <div className="field max-players-field">
                    <label htmlFor={`max-players-${game.bggId}`}>{t("maxPlayersExpansions")}</label>
                    {game.effectiveMaxPlayers && game.effectiveMaxPlayers > (game.maxPlayers ?? 0) && (
                      <span className="field-hint">Calculated from your expansions: {game.effectiveMaxPlayers} players</span>
                    )}
                    <input
                      key={`max-players-${game.bggId}`}
                      id={`max-players-${game.bggId}`}
                      type="number"
                      min="1"
                      max="99"
                      placeholder={String(game.effectiveMaxPlayers || game.maxPlayers || "")}
                      defaultValue={game.maxPlayersOverride || ""}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        const parsed = value ? Number(value) : null;
                        if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 99)) return;
                        void updateAvailability(game.bggId, game.isAvailable, game.unavailableReason, game.versionName, parsed, game.isStandalone ?? false);
                      }}
                    />
                  </div>
                  {game.kind === "boardgameexpansion" && (
                    <div className="field standalone-field">
                      <label>
                        <input
                          type="checkbox"
                          checked={game.isStandalone ?? false}
                          onChange={(e) =>
                            void updateAvailability(
                              game.bggId,
                              game.isAvailable,
                              game.unavailableReason,
                              game.versionName,
                              game.maxPlayersOverride,
                              e.target.checked
                            )
                          }
                        />
                        {" "}Playable Standalone (can be drawn on its own without base game)
                      </label>
                      <span className="field-hint">
                        Check if this box is self-contained and playable independently (e.g. standalone sequel or 2-player core set).
                      </span>
                    </div>
                  )}
                  {game.expansions && game.expansions.length > 0 && (
                    <div className="owned-expansions-list">
                      <strong className="owned-expansions-title">Owned expansions ({game.expansions.length})</strong>
                      <ul>{game.expansions.map((expansion) => (
                        <li key={expansion.bggId}>{expansion.name}{expansion.maxPlayers && expansion.maxPlayers > (game.maxPlayers ?? 0) ? ` · Up to ${expansion.maxPlayers} players` : ""}</li>
                      ))}</ul>
                    </div>
                  )}
                  {game.baseGameTitle && <p className="base-game-reference">Expansion for <strong>{game.baseGameTitle}</strong></p>}
                <div className="collection-remove">
                  {confirmId !== game.bggId && <button type="button" className="collection-remove-trigger" onClick={() => setConfirmId(game.bggId)}>Remove from collection</button>}
                  {confirmId === game.bggId && <div className="confirm-strip">
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
                  </div>}
                </div>
              </section>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
