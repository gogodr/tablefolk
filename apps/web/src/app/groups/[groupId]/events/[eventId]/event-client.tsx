"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { EventDetail, PickResult, SessionLineupResult } from "@tablefolk/contracts";
import { GameCard } from "@/components/game-card";
import { useApi } from "@/lib/api";

type Mode = "single" | "lineup";

export function EventClient() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const api = useApi();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingOfficial, setSavingOfficial] = useState(false);

  const [mode, setMode] = useState<Mode>("lineup");

  // Single Pick controls
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined);
  const [maxWeight, setMaxWeight] = useState<number | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const [singleResult, setSingleResult] = useState<PickResult | null>(null);

  // Session Lineup controls
  const [totalMinutes, setTotalMinutes] = useState<number>(180); // Default 3 hours
  const [allowHeavy, setAllowHeavy] = useState<boolean>(true);
  const [lineupResult, setLineupResult] = useState<SessionLineupResult | null>(null);

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

  async function handleSinglePick(reroll = false) {
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
          ...(reroll && singleResult?.status === "picked" ? { excludeBggId: singleResult.game.bggId } : {}),
        }),
      });
      setSingleResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not draw a game.");
    } finally {
      setPicking(false);
    }
  }

  async function handlePlanLineup(reroll = false) {
    if (!playerCount || playerCount <= 0) return;
    setPicking(true);
    setError("");

    try {
      const excludeBggIds = reroll && lineupResult?.lineup
        ? lineupResult.lineup.map((s) => s.game.bggId)
        : [];

      const data = await api<SessionLineupResult>(`/v1/events/${eventId}/lineup`, {
        method: "POST",
        body: JSON.stringify({
          playerCount,
          totalMinutes,
          allowHeavy,
          excludeBggIds,
        }),
      });
      setLineupResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate session lineup.");
    } finally {
      setPicking(false);
    }
  }

  async function handleSetOfficial(type: "single" | "lineup" | "clear") {
    setSavingOfficial(true);
    setError("");

    try {
      if (type === "clear") {
        await api(`/v1/events/${eventId}/official`, {
          method: "PUT",
          body: JSON.stringify({ type: "clear" }),
        });
      } else if (type === "single" && singleResult?.status === "picked") {
        await api(`/v1/events/${eventId}/official`, {
          method: "PUT",
          body: JSON.stringify({
            type: "single",
            bggId: singleResult.game.bggId,
          }),
        });
      } else if (type === "lineup" && lineupResult?.lineup) {
        await api(`/v1/events/${eventId}/official`, {
          method: "PUT",
          body: JSON.stringify({
            type: "lineup",
            lineup: lineupResult.lineup.map((s) => ({
              role: s.role,
              label: s.label,
              bggId: s.game.bggId,
              name: s.game.name,
              estimatedMinutes: s.estimatedMinutes,
            })),
          }),
        });
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not announce official pick.");
    } finally {
      setSavingOfficial(false);
    }
  }

  const isHostOrCreator = !event?.hostUserId || event?.hostUserId === user?.id;

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

        {/* Mode Switcher */}
        <div className="count-filters" role="group" aria-label="Planning mode">
          <button
            type="button"
            className={`count-filter ${mode === "lineup" ? "active" : ""}`}
            onClick={() => setMode("lineup")}
          >
            <span>✨ Full Session Menu</span>
            <strong>Multi-game</strong>
          </button>
          <button
            type="button"
            className={`count-filter ${mode === "single" ? "active" : ""}`}
            onClick={() => setMode("single")}
          >
            <span>🎲 Single Pick</span>
            <strong>1 title</strong>
          </button>
        </div>
      </div>

      {/* Official Selection Announcement Banner */}
      {(event?.officialPick || (event?.officialLineup && event.officialLineup.length > 0)) && (
        <section className="panel official-selection-banner">
          <div className="official-selection-header">
            <div>
              <span className="eyebrow">📢 Official Announcement</span>
              <h2>Tonight&apos;s Official Game Night Selection</h2>
              <p>The host has locked in this selection for the event.</p>
            </div>
            {isHostOrCreator && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={savingOfficial}
                onClick={() => void handleSetOfficial("clear")}
              >
                {savingOfficial ? "Clearing…" : "✕ Clear Official Pick"}
              </button>
            )}
          </div>

          {event.officialPick && (
            <div className="official-pick-content">
              <span className="slot-role-badge">Featured Game</span>
              <GameCard game={event.officialPick} owners={[]} />
            </div>
          )}

          {event.officialLineup && event.officialLineup.length > 0 && (
            <div className="official-lineup-content">
              <span className="slot-role-badge">Scheduled Lineup</span>
              <div className="lineup-slots">
                {event.officialLineup.map((slot) => (
                  <div key={slot.bggId} className="lineup-slot-card panel">
                    <div className="lineup-slot-header">
                      <span className="slot-role-badge">{slot.label}</span>
                      <span className="slot-time-badge">⏱️ ~{slot.estimatedMinutes} min</span>
                    </div>
                    <h3>{slot.name}</h3>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="draw-layout">
        {/* Draw Controls */}
        <section className="draw-card">
          <h2>{mode === "lineup" ? "Session Menu Planner" : "Single Pick Filters"}</h2>
          <p>
            {mode === "lineup"
              ? "Plan a balanced evening matching your total gathering duration, pairing a main game with warm-up/cooldown fillers (max 1 heavy game)."
              : "Draw 1 title matching your attendees headcount, duration, and complexity."}
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

          {mode === "lineup" ? (
            <>
              <div className="field">
                <label>Total Gathering Duration</label>
                <div className="filter-pill-group">
                  <button
                    type="button"
                    className={`filter-pill ${totalMinutes === 120 ? "active" : ""}`}
                    onClick={() => setTotalMinutes(120)}
                  >
                    2 hours (120m)
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${totalMinutes === 180 ? "active" : ""}`}
                    onClick={() => setTotalMinutes(180)}
                  >
                    3 hours (180m)
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${totalMinutes === 240 ? "active" : ""}`}
                    onClick={() => setTotalMinutes(240)}
                  >
                    4 hours (240m)
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${totalMinutes === 300 ? "active" : ""}`}
                    onClick={() => setTotalMinutes(300)}
                  >
                    5 hours (300m)
                  </button>
                </div>
              </div>

              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={allowHeavy}
                    onChange={(e) => setAllowHeavy(e.target.checked)}
                  />
                  {" "}Allow a Heavy game (Weight &gt; 3.2 · Anti-fatigue rule limits to max 1)
                </label>
              </div>

              <button
                type="button"
                className="button button-large"
                disabled={picking || playerCount <= 0}
                onClick={() => void handlePlanLineup(false)}
              >
                {picking ? "Composing Lineup…" : "✨ Plan Evening Session Menu"}
              </button>
            </>
          ) : (
            <>
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
                onClick={() => void handleSinglePick(false)}
              >
                {picking ? "Rolling the dice…" : "🎲 Draw Game Night Pick"}
              </button>
            </>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
        </section>

        {/* Results Section */}
        <section className="draw-card draw-result" aria-live="polite">
          {mode === "lineup" ? (
            !lineupResult ? (
              <div>
                <h2>Build the Perfect Game Night Menu</h2>
                <p>Choose your session length and hit Plan to get a balanced schedule without brain burn.</p>
                <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
              </div>
            ) : lineupResult.status === "empty" || lineupResult.lineup.length === 0 ? (
              <div className="no-match">
                <img src="/brand/tablefolk-mark.png" alt="" />
                <div>
                  <h2>No available games fit this session.</h2>
                  <p>Check attendee collections or try adding more time.</p>
                </div>
              </div>
            ) : (
              <div>
                <span className="draw-result-intro">
                  ✨ Tonight&apos;s Lineup · Estimated {lineupResult.totalEstimatedMinutes} min of {lineupResult.targetMinutes} min planned
                </span>
                <h2>Game Night Menu</h2>

                <div className="lineup-slots">
                  {lineupResult.lineup.map((slot) => (
                    <div key={slot.game.bggId} className="lineup-slot-card panel">
                      <div className="lineup-slot-header">
                        <span className="slot-role-badge">{slot.label}</span>
                        <span className="slot-time-badge">⏱️ ~{slot.estimatedMinutes} min</span>
                      </div>
                      <GameCard game={slot.game} owners={slot.game.owners} />
                    </div>
                  ))}
                </div>

                <div className="draw-actions">
                  {isHostOrCreator && (
                    <button
                      type="button"
                      className="button"
                      disabled={savingOfficial}
                      onClick={() => void handleSetOfficial("lineup")}
                    >
                      {savingOfficial ? "Saving…" : "📌 Set as Official Event Lineup"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={picking}
                    onClick={() => void handlePlanLineup(true)}
                  >
                    {picking ? "Regenerating…" : "🎲 Reroll Lineup"}
                  </button>
                </div>
              </div>
            )
          ) : !singleResult ? (
            <div>
              <h2>Ready to pick for tonight?</h2>
              <p>Configure the filters on the left and roll the draw.</p>
              <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
            </div>
          ) : singleResult.status === "empty" ? (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>No available games found.</h2>
                <p>None of the confirmed attendees have shared games that are currently marked as available to travel.</p>
              </div>
            </div>
          ) : singleResult.status === "no_match" ? (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>No single game matches these filters.</h2>
                <p>No available game from attendees fits {playerCount} players with the selected time and complexity filters.</p>
              </div>
            </div>
          ) : (
            <div>
              <span className="draw-result-intro">
                ✨ Tonight&apos;s Selection · {singleResult.eligibleCount} {singleResult.eligibleCount === 1 ? "game was eligible" : "games were eligible"}
              </span>
              <h2>Let&apos;s play {singleResult.game.name}!</h2>
              <GameCard game={singleResult.game} owners={singleResult.game.owners} />
              <div className="draw-actions">
                {isHostOrCreator && (
                  <button
                    type="button"
                    className="button"
                    disabled={savingOfficial}
                    onClick={() => void handleSetOfficial("single")}
                  >
                    {savingOfficial ? "Saving…" : "📌 Set as Official Event Game"}
                  </button>
                )}
                <button
                  type="button"
                  className="button-secondary"
                  disabled={picking}
                  onClick={() => void handleSinglePick(true)}
                >
                  {picking ? "Rerolling…" : "🎲 Pick another"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
