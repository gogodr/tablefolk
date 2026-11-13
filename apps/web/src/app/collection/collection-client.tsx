"use client";

import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionGame, GroupSummary, BggSyncResult } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { GameSearch } from "@/components/game-search";
import { ShareControl } from "@/components/share-control";
import { useApi } from "@/lib/api";

type Filter = "all" | "boardgame" | "boardgameexpansion" | "available";

export function CollectionClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const api = useApi();
  const [games, setGames] = useState<CollectionGame[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const inspectorRef = useRef<HTMLDialogElement>(null);

  // BGG Sync State
  const [bggUsername, setBggUsername] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [collection, groupData] = await Promise.all([
        api<{ games: CollectionGame[] }>("/v1/collection"),
        api<{ groups: GroupSummary[] }>("/v1/groups"),
      ]);
      setGames(collection.games);
      setGroups(groupData.groups);
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

  const shown = filter === "all"
    ? games
    : filter === "available"
      ? games.filter((game) => game.isAvailable)
      : games.filter((game) => game.kind === filter);

  const game = selectedGame;

  return (
    <div className="page collection-page">
      <div className="page-header collection-heading">
        <div>
          <h1>My collection</h1>
          <p>Keep the games you own close, manage what can travel, and share them with your groups.</p>
        </div>
        <Link href="/groups" className="collection-groups-link">View groups</Link>
      </div>

      <div className="collection-tools">
        <details className="collection-tool collection-tool-add">
          <summary>Add a game</summary>
          <div className="collection-tool-content"><GameSearch onAdded={() => void load()} /></div>
        </details>
        <details className="collection-tool">
          <summary>Import from BoardGameGeek</summary>
          <div className="collection-tool-content">
            <p>Connect your BGG account to automatically import and refresh your owned collection.</p>
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
          </div>
        </details>
      </div>

      <div className="section-title">
        <h2>Your games</h2>
        <p>{games.length} {games.length === 1 ? "game" : "games"}</p>
      </div>

      <div className="count-filters" role="group" aria-label="Filter games">
        {(["all", "available", "boardgame", "boardgameexpansion"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={`count-filter ${filter === kind ? "active" : ""}`}
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            <span>
              {kind === "all"
                ? "All games"
                : kind === "available"
                  ? "Available to travel"
                  : kind === "boardgame"
                    ? "Base games"
                    : "Expansions"}
            </span>
            <strong>
              {kind === "all"
                ? games.length
                : kind === "available"
                  ? games.filter((g) => g.isAvailable).length
                  : games.filter((g) => g.kind === kind).length}
            </strong>
          </button>
        ))}
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
            <h2>No games in this category yet.</h2>
            <p>Try another filter or add a game above.</p>
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
                      aria-label={`Share ${game.name} with groups`}
                    >
                      Share {game.sharedGroupIds.length > 0 && <span>{game.sharedGroupIds.length}</span>}
                    </button>
                    <button
                      type="button"
                      className="collection-action"
                      onClick={() => openInspector(game.bggId, "details")}
                      aria-label={`Manage ${game.name}`}
                    >
                      Manage
                    </button>
                  </div>
                }
              />
              <span className={`collection-status ${game.isAvailable ? "" : "collection-status-unavailable"}`}>
                {game.isAvailable ? "Available to travel" : game.unavailableReason || "Unavailable"}
              </span>
            </div>
          ))}
        </div>
      )}

      <dialog
        ref={inspectorRef}
        className="collection-inspector"
        aria-label={game ? `Manage ${game.name}` : "Manage game"}
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
                <p>{game.isAvailable ? "Available to travel" : game.unavailableReason || "Unavailable"}</p>
              </div>
              <button type="button" className="collection-close" onClick={() => inspectorRef.current?.close()} aria-label="Close game details">Close</button>
            </div>
            <div className="collection-inspector-tabs" role="group" aria-label="Game settings">
              <button type="button" className={sharingId === game.bggId ? "active" : ""} aria-pressed={sharingId === game.bggId} onClick={() => openInspector(game.bggId, "share")}>Share</button>
              <button type="button" className={editingId === game.bggId ? "active" : ""} aria-pressed={editingId === game.bggId} onClick={() => openInspector(game.bggId, "details")}>Details</button>
            </div>

            {sharingId === game.bggId ? (
              <section className="collection-inspector-section">
                <h3>Share with groups</h3>
                <ShareControl
                  bggId={game.bggId}
                  sharedGroupIds={game.sharedGroupIds}
                  groups={groups}
                  onChanged={() => void load()}
                />
              </section>
            ) : (
              <section className="collection-inspector-section">
                <h3>Game Availability &amp; Version</h3>
                  <div className="field">
                    <label>
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
                      {" "}Available to bring to Game Nights
                    </label>
                  </div>

                  {!game.isAvailable && (
                    <div className="field">
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

                  <div className="field">
                    <label htmlFor={`version-${game.bggId}`}>Specific Edition / Version Name</label>
                    <input
                      key={game.bggId}
                      id={`version-${game.bggId}`}
                      type="text"
                      placeholder="e.g. 25th Anniversary, 2nd Edition"
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
