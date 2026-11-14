"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { GroupDetail, GroupGame, UserVotingSummary } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { useApi } from "@/lib/api";

export function GroupClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [games, setGames] = useState<GroupGame[]>([]);
  const [votingSummary, setVotingSummary] = useState<UserVotingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [votingBggId, setVotingBggId] = useState<number | null>(null);
  const [filterKind, setFilterKind] = useState<"base" | "all" | "expansions">("base");

  const load = useCallback(async () => {
    try {
      const [groupData, gameData, interestData] = await Promise.all([
        api<{ group: GroupDetail }>(`/v1/groups/${groupId}`),
        api<{ games: GroupGame[] }>(`/v1/groups/${groupId}/games`),
        api<{ summary: UserVotingSummary }>(`/v1/groups/${groupId}/interest`).catch(() => null),
      ]);
      setGroup(groupData.group);
      setGames(gameData.games);
      if (interestData) setVotingSummary(interestData.summary);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this group.");
    } finally {
      setLoading(false);
    }
  }, [api, groupId]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, load]);

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
      await load();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Failed to cast vote.");
    } finally {
      setVotingBggId(null);
    }
  }

  if (!isLoaded || loading) return <div className="page"><p className="loading">Loading group…</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Sign in to see this group.</h1>
        <Link href="/sign-in" className="button">Sign in</Link>
      </section>
    );
  }

  if (error || !group) {
    return (
      <section className="narrow-page">
        <div className="state-message error" role="alert">
          <p>{error || "Group not found."}</p>
          <button className="button-quiet" onClick={() => void load()}>Try again</button>
        </div>
      </section>
    );
  }

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
              <h3>Want to Play · Group Wishlist</h3>
              <p>
                Vote for any game (yours or a friend&apos;s!) to increase its chances in upcoming Game Nights.
                Points only degrade when a game wins!
              </p>
            </div>
            <div className="voting-points-badge">
              <strong>⭐ {votingSummary.availablePoints}</strong> points available
            </div>
          </div>
        </div>
      )}

      <div className="section-title">
        <div>
          <h2>Shared games</h2>
          <p>One entry per game, all sharing members and editions shown</p>
        </div>
        <div className="filter-chips">
          <button
            type="button"
            className={`filter-chip ${filterKind === "base" ? "active" : ""}`}
            onClick={() => setFilterKind("base")}
          >
            Base Games ({games.filter((g) => g.kind !== "boardgameexpansion" || g.isStandalone).length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filterKind === "all" ? "active" : ""}`}
            onClick={() => setFilterKind("all")}
          >
            All Items ({games.length})
          </button>
          {games.some((g) => g.kind === "boardgameexpansion") && (
            <button
              type="button"
              className={`filter-chip ${filterKind === "expansions" ? "active" : ""}`}
              onClick={() => setFilterKind("expansions")}
            >
              Expansions Only ({games.filter((g) => g.kind === "boardgameexpansion").length})
            </button>
          )}
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
        <div className="game-grid">
          {games
            .filter((game) => {
              if (filterKind === "base") return game.kind !== "boardgameexpansion" || game.isStandalone;
              if (filterKind === "expansions") return game.kind === "boardgameexpansion";
              return true;
            })
            .map((game) => (
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
    </div>
  );
}
