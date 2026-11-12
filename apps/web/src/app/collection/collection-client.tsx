"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { CollectionGame, GroupSummary } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { GameSearch } from "@/components/game-search";
import { ShareControl } from "@/components/share-control";
import { useApi } from "@/lib/api";

type Filter = "all" | "boardgame" | "boardgameexpansion";

export function CollectionClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [games, setGames] = useState<CollectionGame[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

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
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { if (isLoaded && isSignedIn) void load(); else if (isLoaded) setLoading(false); }, [isLoaded, isSignedIn, load]);

  async function removeGame(bggId: number) {
    setRemovingId(bggId);
    try {
      await api(`/v1/collection/${bggId}`, { method: "DELETE" });
      setConfirmId(null);
      setSharingId(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove that game."); }
    finally { setRemovingId(null); }
  }

  if (!isLoaded || loading) return <div className="page"><p className="loading">Loading your collection…</p></div>;
  if (!isSignedIn) return <section className="narrow-page notice-page"><h1>Your collection starts here.</h1><p>Sign in to add games and share them with a group.</p><Link href="/sign-in" className="button">Sign in</Link></section>;

  const shown = filter === "all" ? games : games.filter((game) => game.kind === filter);
  return <div className="page">
    <div className="page-header"><div><h1>My collection</h1><p>Keep the games you own close, then choose what each group can see.</p></div><Link href="/groups" className="button-secondary">View groups</Link></div>
    <GameSearch onAdded={() => void load()} />
    <div className="section-title"><h2>Your games</h2><p>{games.length} {games.length === 1 ? "game" : "games"}</p></div>
    <div className="count-filters" role="group" aria-label="Filter games">
      {(["all", "boardgame", "boardgameexpansion"] as const).map((kind) => <button key={kind} type="button" className={`count-filter ${filter === kind ? "active" : ""}`} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>
        <span>{kind === "all" ? "All games" : kind === "boardgame" ? "Base games" : "Expansions"}</span>
        <strong>{kind === "all" ? games.length : games.filter((game) => game.kind === kind).length}</strong>
      </button>)}
    </div>
    {error && <div className="state-message error" role="alert"><p>{error}</p><button className="button-quiet" onClick={() => void load()}>Try again</button></div>}
    {games.length === 0 ? <div className="empty-state"><img src="/brand/tablefolk-mark.png" alt="" /><div><h2>Your shelf is ready for its first game.</h2><p>Search above for a game you own. You can share it with a group afterward.</p></div></div> : shown.length === 0 ? <div className="empty-state"><div><h2>No games in this category yet.</h2><p>Try another filter or add a game above.</p></div></div> : <div className="game-grid">
      {shown.map((game) => <div className="collection-card-wrap" key={game.bggId}>
        <GameCard game={game} actions={<div className="game-actions">
          <button type="button" className="button-quiet" onClick={() => setSharingId(sharingId === game.bggId ? null : game.bggId)}>Share</button>
          <button type="button" className="button-quiet" onClick={() => setConfirmId(game.bggId)}>Remove</button>
        </div>} />
        {sharingId === game.bggId && <ShareControl bggId={game.bggId} sharedGroupIds={game.sharedGroupIds} groups={groups} onChanged={() => void load()} />}
        {confirmId === game.bggId && <div className="confirm-strip"><span>Remove {game.name}? This also stops sharing your copy with {game.sharedGroupIds.length} {game.sharedGroupIds.length === 1 ? "group" : "groups"}.</span><button className="button-danger button-small" disabled={removingId !== null} onClick={() => void removeGame(game.bggId)}>{removingId === game.bggId ? "Removing…" : "Remove game"}</button><button className="button-secondary button-small" onClick={() => setConfirmId(null)}>Cancel</button></div>}
      </div>)}
    </div>}
  </div>;
}
