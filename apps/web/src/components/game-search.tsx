"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";

interface SearchResult { bggId: number; kind: "boardgame" | "boardgameexpansion"; name: string; yearPublished: number | null }

export function GameSearch({ onAdded }: { onAdded: () => void }) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await api<{ games: SearchResult[] }>(`/v1/catalog/search?q=${encodeURIComponent(query.trim())}`);
        if (!cancelled) setResults(data.games);
      } catch (cause) {
        if (!cancelled) { setResults([]); setError(cause instanceof Error ? cause.message : "Search is unavailable."); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, query]);

  async function addGame(bggId: number) {
    setAddingId(bggId);
    setError("");
    try {
      await api("/v1/collection", { method: "POST", body: JSON.stringify({ bggId }) });
      setQuery("");
      setResults([]);
      onAdded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that game.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header"><h2>Add a game</h2><a className="bgg-credit" href="https://boardgamegeek.com" target="_blank" rel="noreferrer"><img src="/vendor/powered_by_bgg.webp" alt="Powered by BoardGameGeek" width="200" height="59" /></a></div>
      <div className="field">
        <label htmlFor="game-search">Game name</label>
        <input id="game-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a board game or expansion" autoComplete="off" />
        <span className="field-hint">Game details are saved here when you add one.</span>
      </div>
      {searching && <p className="loading" role="status">Searching BoardGameGeek…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!searching && query.trim().length >= 2 && results.length === 0 && !error && <p className="muted">No games found for that search.</p>}
      {results.length > 0 && <div className="search-results" role="list" aria-label="Search results">
        {results.map((game) => <button key={game.bggId} type="button" className="search-result" onClick={() => addGame(game.bggId)} disabled={addingId !== null} role="listitem">
          <span><strong>{game.name}</strong><small>{game.kind === "boardgameexpansion" ? "Expansion" : "Board game"}{game.yearPublished ? ` · ${game.yearPublished}` : ""}</small></span>
          <span className="text-link">{addingId === game.bggId ? "Adding…" : "Add"}</span>
        </button>)}
      </div>}
    </div>
  );
}
