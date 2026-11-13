"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { EventDetail, PickResult } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { useApi } from "@/lib/api";

export function EventClient() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Picker controls
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined);
  const [maxWeight, setMaxWeight] = useState<number | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<PickResult | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ event: EventDetail }>(`/v1/events/${eventId}`);
      setEvent(data.event);
      setPlayerCount(data.event.totalHeadcount || 4);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this event.");
    } finally {
      setLoading(false);
    }
  }, [api, eventId]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, load]);

  async function handlePick(reroll = false) {
    if (!playerCount || playerCount <= 0) return;
    setPicking(true);
    setError("");

    try {
      const data = await api<PickResult>(`/v1/events/${eventId}/pick`, {
        method: "POST",
        body: JSON.stringify({
          playerCount,
          maxDuration,
          maxWeight,
          ...(reroll && result?.status === "picked" ? { excludeBggId: result.game.bggId } : {}),
        }),
      });
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not draw a game.");
    } finally {
      setPicking(false);
    }
  }

  if (!isLoaded || loading) return <div className="page"><p className="loading">Entering Game Night room…</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Sign in to join this game night.</h1>
        <Link href="/sign-in" className="button">Sign in</Link>
      </section>
    );
  }

  if (error && !event) {
    return (
      <section className="narrow-page">
        <div className="state-message error" role="alert">
          <p>{error || "Event not found."}</p>
          <Link href={`/groups/${groupId}/events`} className="button-secondary">Back to Events</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="page">
      <Link href={`/groups/${groupId}/events`} className="back-link">← All Events</Link>

      <div className="page-header">
        <div>
          <span className="eyebrow">
            {event && new Date(event.scheduledDate).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <h1>{event?.title}</h1>
          <p>
            {event?.location ? `📍 ${event.location} · ` : ""}
            {event?.hostDisplayName ? `🏠 Host: ${event.hostDisplayName} · ` : ""}
            <strong>{event?.totalHeadcount}</strong> players confirmed
          </p>
        </div>
      </div>

      <div className="draw-layout">
        {/* Draw Controls */}
        <section className="draw-card">
          <h2>Game Night Filters</h2>
          <p>
            Games are drawn exclusively from <strong>attending members</strong> and available copies
            (including the host&apos;s home library). Games with more Want-to-Play votes have higher chances!
          </p>

          <div className="field">
            <label htmlFor="headcount">Attendees Headcount</label>
            <input
              id="headcount"
              type="number"
              min={1}
              max={100}
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
            />
            <span className="field-hint">Defaults to attending RSVPs + guests</span>
          </div>

          <div className="field">
            <label>Maximum Playing Time</label>
            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-pill ${maxDuration === undefined ? "active" : ""}`}
                onClick={() => setMaxDuration(undefined)}
              >
                Any length
              </button>
              <button
                type="button"
                className={`filter-pill ${maxDuration === 45 ? "active" : ""}`}
                onClick={() => setMaxDuration(45)}
              >
                ≤ 45 min
              </button>
              <button
                type="button"
                className={`filter-pill ${maxDuration === 90 ? "active" : ""}`}
                onClick={() => setMaxDuration(90)}
              >
                ≤ 90 min
              </button>
              <button
                type="button"
                className={`filter-pill ${maxDuration === 120 ? "active" : ""}`}
                onClick={() => setMaxDuration(120)}
              >
                ≤ 2 hours
              </button>
            </div>
          </div>

          <div className="field">
            <label>Complexity / Weight</label>
            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-pill ${maxWeight === undefined ? "active" : ""}`}
                onClick={() => setMaxWeight(undefined)}
              >
                Any weight
              </button>
              <button
                type="button"
                className={`filter-pill ${maxWeight === 2.2 ? "active" : ""}`}
                onClick={() => setMaxWeight(2.2)}
              >
                Light (≤ 2.2)
              </button>
              <button
                type="button"
                className={`filter-pill ${maxWeight === 3.5 ? "active" : ""}`}
                onClick={() => setMaxWeight(3.5)}
              >
                Medium (≤ 3.5)
              </button>
            </div>
          </div>

          <button
            type="button"
            className="button button-large"
            disabled={picking || playerCount <= 0}
            onClick={() => void handlePick(false)}
          >
            {picking ? "Rolling the dice…" : "🎲 Draw Game Night Pick"}
          </button>

          {error && <p className="form-error" role="alert">{error}</p>}
        </section>

        {/* Draw Results */}
        <section className="draw-card draw-result" aria-live="polite">
          {!result && (
            <div>
              <h2>Ready to pick for tonight?</h2>
              <p>Configure the filters on the left and roll the draw.</p>
              <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
            </div>
          )}

          {result?.status === "empty" && (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>No available games found.</h2>
                <p>
                  None of the confirmed attendees have shared games that are currently marked as available to travel.
                </p>
              </div>
            </div>
          )}

          {result?.status === "no_match" && (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>No single game matches these filters.</h2>
                <p>
                  No available game from attendees fits {playerCount} players with the selected time and complexity filters.
                </p>
                <p className="draw-hint">Tip: Try loosening the duration or complexity filter, or splitting into two tables!</p>
              </div>
            </div>
          )}

          {result?.status === "picked" && (
            <div>
              <span className="draw-result-intro">
                ✨ Tonight&apos;s Selection · {result.eligibleCount} {result.eligibleCount === 1 ? "game was eligible" : "games were eligible"}
              </span>
              <h2>Let&apos;s play {result.game.name}!</h2>
              <GameCard game={result.game} owners={result.game.owners} />
              <p className="draw-hint">
                {result.game.kind === "boardgameexpansion"
                  ? "This is an expansion and may need the base game. "
                  : ""}
                Ask the sharing member to bring their copy. Winning this pick will reset its Want-to-Play hype so other games can get their turn!
              </p>
              <div className="draw-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={picking}
                  onClick={() => void handlePick(true)}
                >
                  {picking ? "Rerolling…" : "🎲 Pick another"}
                </button>
                {result.onlyMatch && (
                  <span className="draw-hint">This is the only matching game in the attendee pool.</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
