"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useApi } from "@/lib/api";

interface SearchResult { bggId: number; kind: "boardgame" | "boardgameexpansion"; name: string; yearPublished: number | null }

export function GameSearch({ onAdded }: { onAdded: () => void }) {
  const api = useApi();
  const inputId = useId();
  const listId = `${inputId}-results`;
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const data = await api<{ games: SearchResult[] }>(`/v1/catalog/search?q=${encodeURIComponent(query.trim())}`);
        if (!cancelled) {
          const seen = new Set<number>();
          setResults(data.games.filter((game) => {
            if (seen.has(game.bggId)) return false;
            seen.add(game.bggId);
            return true;
          }));
          setActiveIndex(-1);
        }
      } catch (cause) {
        if (!cancelled) { setResults([]); setError(cause instanceof Error ? cause.message : "Search is unavailable."); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, query]);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.children.item(activeIndex);
    if (!list || !option) return;
    const listBounds = list.getBoundingClientRect();
    const optionBounds = option.getBoundingClientRect();
    if (optionBounds.bottom > listBounds.bottom) list.scrollTop += optionBounds.bottom - listBounds.bottom;
    if (optionBounds.top < listBounds.top) list.scrollTop -= listBounds.top - optionBounds.top;
  }, [activeIndex]);

  async function addGame(bggId: number) {
    setAddingId(bggId);
    setError("");
    try {
      await api("/v1/collection", { method: "POST", body: JSON.stringify({ bggId }) });
      setQuery("");
      setResults([]);
      setOpen(false);
      setActiveIndex(-1);
      onAdded();
      inputRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that game.");
      setOpen(true);
    } finally {
      setAddingId(null);
    }
  }

  const expanded = open && query.trim().length >= 2;

  return (
    <div className={`panel game-search-panel${expanded ? " game-search-panel-open" : ""}`}>
      {expanded && <div className="game-search-veil" aria-hidden="true" onPointerDown={(event) => { event.preventDefault(); setOpen(false); }} />}
      <div className="panel-header"><h2>Add a game</h2><a className="bgg-credit" href="https://boardgamegeek.com" target="_blank" rel="noreferrer"><img src="/vendor/powered_by_bgg.webp" alt="Powered by BoardGameGeek" width="200" height="59" /></a></div>
      <div className="field">
        <label htmlFor={inputId}>Game name</label>
        <div className="game-search-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded && results.length > 0 ? listId : undefined}
            aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${results[activeIndex]?.bggId}` : undefined}
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setResults([]);
              setActiveIndex(-1);
              setError("");
              setSearching(next.trim().length >= 2);
              setOpen(true);
            }}
            onFocus={() => { if (query.trim().length >= 2) setOpen(true); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") { setOpen(false); setActiveIndex(-1); return; }
              if (!expanded || results.length === 0) return;
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => index <= 0 ? results.length - 1 : index - 1); }
              if (event.key === "Enter" && addingId === null) {
                event.preventDefault();
                const selected = results[activeIndex >= 0 ? activeIndex : 0];
                if (selected) void addGame(selected.bggId);
              }
            }}
            placeholder="Search for a board game or expansion"
            autoComplete="off"
          />
          {expanded && (
            <div className="game-search-dropdown">
              {searching && <p className="game-search-message" role="status">Searching BoardGameGeek…</p>}
              {error && <p className="game-search-message form-error" role="alert">{error}</p>}
              {!searching && !error && results.length === 0 && <p className="game-search-message">No games found for that search.</p>}
              {results.length > 0 && <div id={listId} ref={listRef} role="listbox" aria-label="Search results">
                {results.map((game, index) => <button
                  key={game.bggId}
                  id={`${listId}-${game.bggId}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  className={`search-result ${index === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void addGame(game.bggId)}
                  disabled={addingId !== null}
                >
                  <span><strong>{game.name}</strong><small>{game.kind === "boardgameexpansion" ? "Expansion" : "Board game"}{game.yearPublished ? ` (${game.yearPublished})` : ""}</small></span>
                  <span className="text-link">{addingId === game.bggId ? "Adding…" : "Add"}</span>
                </button>)}
              </div>}
            </div>
          )}
        </div>
        <span className="field-hint">Game details are saved here when you add one.</span>
      </div>
    </div>
  );
}
