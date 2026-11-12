"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { GroupDetail, GroupGame } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { useApi } from "@/lib/api";

export function GroupClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [games, setGames] = useState<GroupGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [groupData, gameData] = await Promise.all([
        api<{ group: GroupDetail }>(`/v1/groups/${groupId}`),
        api<{ games: GroupGame[] }>(`/v1/groups/${groupId}/games`),
      ]);
      setGroup(groupData.group); setGames(gameData.games); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this group."); }
    finally { setLoading(false); }
  }, [api, groupId]);
  useEffect(() => { if (isLoaded && isSignedIn) void load(); else if (isLoaded) setLoading(false); }, [isLoaded, isSignedIn, load]);

  if (!isLoaded || loading) return <div className="page"><p className="loading">Loading group…</p></div>;
  if (!isSignedIn) return <section className="narrow-page notice-page"><h1>Sign in to see this group.</h1><Link href="/sign-in" className="button">Sign in</Link></section>;
  if (error || !group) return <section className="narrow-page"><div className="state-message error" role="alert"><p>{error || "Group not found."}</p><button className="button-quiet" onClick={() => void load()}>Try again</button></div></section>;
  return <div className="page">
    <Link href="/groups" className="back-link">← All groups</Link>
    <div className="page-header"><div><h1>{group.name}</h1><p>{group.memberCount} {group.memberCount === 1 ? "member" : "members"} · {games.length} {games.length === 1 ? "game" : "games"} ready to consider</p></div><div className="page-actions"><Link className="button-secondary" href={`/groups/${groupId}/members`}>Members</Link><Link className="button" href={`/groups/${groupId}/game-night`}>Pick for game night</Link></div></div>
    <div className="section-title"><h2>Shared games</h2><p>One entry per game, all sharing members shown</p></div>
    {games.length === 0 ? <div className="empty-state"><img src="/brand/tablefolk-mark.png" alt="" /><div><h2>No games on this table yet.</h2><p>Members can share games from their own collections.</p><Link className="text-link" href="/collection">Go to my collection</Link></div></div> : <div className="game-grid">{games.map((game) => <GameCard key={game.bggId} game={game} owners={game.owners} />)}</div>}
  </div>;
}
