"use client";

import { useState } from "react";
import type { PickResult } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { useApi } from "@/lib/api";

export function DrawPanel({ groupId }: { groupId: string }) {
  const api = useApi();
  const [playerCount, setPlayerCount] = useState("");
  const [result, setResult] = useState<PickResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function draw(event?: React.FormEvent<HTMLFormElement>, reroll = false) {
    event?.preventDefault();
    const count = Number(playerCount);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError("Enter a whole number of players between 1 and 1,000."); return;
    }
    setBusy(true); setError("");
    try {
      const data = await api<PickResult>(`/v1/groups/${groupId}/picks`, {
        method: "POST",
        body: JSON.stringify({ playerCount: count, ...(reroll && result?.status === "picked" ? { excludeBggId: result.game.bggId } : {}) }),
      });
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not pick a game."); }
    finally { setBusy(false); }
  }

  return <div className="draw-layout">
    <section className="draw-card">
      <h2>How many people are playing?</h2><p>We&apos;ll draw from the games this group shares that fit your player count.</p>
      <form onSubmit={(event) => void draw(event)}><div className="field"><label htmlFor="player-count">Players</label><input id="player-count" type="number" min={1} max={1000} step={1} inputMode="numeric" value={playerCount} onChange={(event) => { setPlayerCount(event.target.value); setResult(null); }} placeholder="e.g. 5" /></div><button className="button" type="submit" disabled={busy}>{busy ? "Picking…" : "Pick a game"}</button></form>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
    <section className="draw-card draw-result" aria-live="polite">
      {!result && <div><h2>Let the group decide with a draw.</h2><p>Choose the headcount to see what fits your table.</p><img className="draw-art" src="/brand/tablefolk-mark.png" alt="" /></div>}
      {result?.status === "empty" && <div className="no-match"><img src="/brand/tablefolk-mark.png" alt="" /><div><h2>No shared games yet.</h2><p>Ask group members to share games from their personal collections, then come back to draw.</p></div></div>}
      {result?.status === "no_match" && <div className="no-match"><img src="/brand/tablefolk-mark.png" alt="" /><div><h2>No single game fits {playerCount} players.</h2><p>Maybe break down the party in multiple groups?</p>{result.unknownPlayerCount > 0 && <p className="draw-hint">{result.unknownPlayerCount} {result.unknownPlayerCount === 1 ? "game has" : "games have"} no player count listed and could not be included.</p>}</div></div>}
      {result?.status === "picked" && <div><span className="draw-result-intro">Your game night pick · {result.eligibleCount} {result.eligibleCount === 1 ? "game fits" : "games fit"}</span><h2>Let&apos;s play {result.game.name}.</h2><GameCard game={result.game} owners={result.game.owners} /><p className="draw-hint">{result.game.kind === "boardgameexpansion" ? "This is an expansion and may need a base game. " : ""}Check with a sharing member that they can bring it.</p><div className="draw-actions"><button className="button-secondary" disabled={busy} onClick={() => void draw(undefined, true)}>{busy ? "Picking…" : "Pick another"}</button>{result.onlyMatch && <span className="draw-hint">This is the only listed game that fits.</span>}</div></div>}
    </section>
  </div>;
}
