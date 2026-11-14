"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventDetail, PickResult, SessionLineupResult } from "@tablefolk/contracts";
import { GameCard, cleanExpansionName } from "@/components/game-card";
import { useApi } from "@/lib/api";

type Mode = "lineup" | "single";

export function DrawPanel({ groupId }: { groupId: string }) {
  const api = useApi();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("lineup");

  // Common headcount
  const [playerCount, setPlayerCount] = useState<string>("4");

  // Single Pick states
  const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined);
  const [maxWeight, setMaxWeight] = useState<number | undefined>(undefined);
  const [singleResult, setSingleResult] = useState<PickResult | null>(null);

  // Lineup states
  const [totalMinutes, setTotalMinutes] = useState<number>(180);
  const [allowHeavy, setAllowHeavy] = useState<boolean>(true);
  const [lineupResult, setLineupResult] = useState<SessionLineupResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleSinglePick(reroll = false) {
    const count = Number(playerCount);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError("Enter a whole number of players between 1 and 1,000.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<PickResult>(`/v1/groups/${groupId}/picks`, {
        method: "POST",
        body: JSON.stringify({
          playerCount: count,
          maxDuration,
          maxWeight,
          ...(reroll && singleResult?.status === "picked" ? { excludeBggId: singleResult.game.bggId } : {}),
        }),
      });
      setSingleResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pick a game.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePlanLineup(reroll = false) {
    const count = Number(playerCount);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError("Enter a whole number of players between 1 and 1,000.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const excludeBggIds = reroll && lineupResult?.lineup
        ? lineupResult.lineup.map((s) => s.game.bggId)
        : [];
      const data = await api<SessionLineupResult>(`/v1/groups/${groupId}/lineup`, {
        method: "POST",
        body: JSON.stringify({
          playerCount: count,
          totalMinutes,
          allowHeavy,
          excludeBggIds,
        }),
      });
      setLineupResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not compose lineup.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAsEvent() {
    if (!lineupResult || lineupResult.lineup.length === 0) return;
    setSavingEvent(true);
    setError("");

    try {
      const dateStr = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const { event } = await api<{ event: EventDetail }>(`/v1/groups/${groupId}/events`, {
        method: "POST",
        body: JSON.stringify({
          title: `Game Night (${dateStr})`,
          scheduledDate: new Date().toISOString(),
          manualHeadcount: Number(playerCount) || 4,
        }),
      });

      await api(`/v1/events/${event.id}/official`, {
        method: "PUT",
        body: JSON.stringify({
          type: "lineup",
          lineup: lineupResult.lineup.map((s) => ({
            role: s.role,
            label: s.label,
            bggId: s.game.bggId,
            name: s.game.name,
            estimatedMinutes: s.estimatedMinutes,
            carrierDisplayName: s.game.owners[0]?.displayName ?? undefined,
            expansions: s.game.expansions?.map((e) => ({ bggId: e.bggId, name: e.name })),
          })),
        }),
      });

      router.push(`/groups/${groupId}/events/${event.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save lineup as event.");
      setSavingEvent(false);
    }
  }

  function handleCopyLineup() {
    if (!lineupResult || lineupResult.lineup.length === 0) return;
    const textLines = [
      `🎲 *Game Night Lineup · Tablefolk*`,
      `⏱️ Planned Time: ~${lineupResult.totalEstimatedMinutes} min${
        lineupResult.transitionMinutes ? ` (includes ${lineupResult.transitionMinutes}m setup & breaks)` : ""
      }`,
      ``,
      ...lineupResult.lineup.flatMap((s, idx) => {
        const expText = s.game.expansions && s.game.expansions.length > 0
          ? ` (+ ${s.game.expansions.map((e) => cleanExpansionName(s.game.name, e.name)).join(", ")})`
          : "";
        return [
          ...(idx > 0 && s.transitionBeforeMinutes ? [`  ${s.transitionReason ?? `☕ ${s.transitionBeforeMinutes}m Setup buffer`}`] : []),
          `• ${s.label}: *${s.game.name}*${expText} (~${s.estimatedMinutes} min)`,
        ];
      }),
    ];
    void navigator.clipboard.writeText(textLines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="draw-container">
      {/* Mode switcher pills */}
      <div className="section-title" style={{ marginBottom: 20 }}>
        <div>
          <h2>Draw Mode</h2>
          <p>Roll for a single title or let the engine compose a balanced multi-game session menu.</p>
        </div>
        <div className="share-pills">
          <button
            type="button"
            className={`count-filter ${mode === "lineup" ? "active" : ""}`}
            onClick={() => setMode("lineup")}
          >
            <span>🍱 Session Menu</span>
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

      <div className="draw-layout">
        <section className="draw-card">
          <div className="draw-card-header">
            <h2>{mode === "lineup" ? "Session Menu Planner" : "Single Pick Filters"}</h2>
            <p>
              {mode === "lineup"
                ? "Plan a balanced evening matching your total gathering duration, pairing a main game with warm-up/cooldown fillers (max 1 heavy game)."
                : "Draw 1 title matching your players headcount, duration, and complexity."}
            </p>
          </div>

          <div className="draw-card-form">
            <div className="field">
              <label htmlFor="draw-player-count">Players Headcount</label>
              <input
                id="draw-player-count"
                type="number"
                min={1}
                max={1000}
                value={playerCount}
                onChange={(e) => setPlayerCount(e.target.value)}
                placeholder="e.g. 5"
              />
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

                <label className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={allowHeavy}
                    onChange={(e) => setAllowHeavy(e.target.checked)}
                  />
                  <span>Allow a Heavy game (Weight &gt; 3.2 · Anti-fatigue rule limits to max 1)</span>
                </label>

                <button
                  type="button"
                  className="button button-large"
                  disabled={busy || !playerCount}
                  onClick={() => void handlePlanLineup(false)}
                >
                  {busy ? "Composing Lineup…" : "✨ Plan Evening Session Menu"}
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
                      ⚡ Short (&le; 45m)
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxDuration === 90 ? "active" : ""}`}
                      onClick={() => setMaxDuration(90)}
                    >
                      🎯 Standard (&le; 90m)
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxDuration === 150 ? "active" : ""}`}
                      onClick={() => setMaxDuration(150)}
                    >
                      ⏳ Long (&le; 2.5h)
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Maximum Complexity (BGG Weight)</label>
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
                      🟢 Light / Casual (&le; 2.2)
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxWeight === 3.2 ? "active" : ""}`}
                      onClick={() => setMaxWeight(3.2)}
                    >
                      🟡 Medium (&le; 3.2)
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${maxWeight === 4.5 ? "active" : ""}`}
                      onClick={() => setMaxWeight(4.5)}
                    >
                      🔴 Heavy (&le; 4.5)
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="button button-large"
                  disabled={busy || !playerCount}
                  onClick={() => void handleSinglePick(false)}
                >
                  {busy ? "Picking…" : "🎲 Pick a Game"}
                </button>
              </>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </section>

        {/* Results Panel */}
        <section className="draw-card draw-result" aria-live="polite">
          {mode === "lineup" ? (
            !lineupResult ? (
              <div>
                <h2>Ready to plan tonight&apos;s menu?</h2>
                <p>Pick the duration on the left to compose a balanced sequence of games.</p>
                <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
              </div>
            ) : lineupResult.status === "empty" || lineupResult.lineup.length === 0 ? (
              <div className="no-match">
                <img src="/brand/tablefolk-mark.png" alt="" />
                <div>
                  <h2>No matching lineup found.</h2>
                  <p>Try allowing heavy games, choosing a different duration, or adding more games to your group.</p>
                </div>
              </div>
            ) : (
              <div>
                <span className="draw-result-intro">
                  ✨ Tonight&apos;s Lineup · Estimated {lineupResult.totalEstimatedMinutes} min of {lineupResult.targetMinutes} min planned
                  {lineupResult.transitionMinutes ? ` (${lineupResult.transitionMinutes}m buffer included)` : ""}
                </span>
                <h2>Game Night Menu</h2>

                <div className="lineup-slots">
                  {lineupResult.lineup.map((slot, idx) => (
                    <div key={slot.game.bggId} style={{ display: "contents" }}>
                      {idx > 0 && (
                        <div className="lineup-buffer-pill">
                          {slot.transitionReason ?? `☕ ${slot.transitionBeforeMinutes ?? 15}m Intermission & Setup buffer`}
                        </div>
                      )}
                      <div className="lineup-slot-card panel">
                        <div className="lineup-slot-header">
                          <span className="slot-role-badge">{slot.label}</span>
                          <span className="slot-time-badge">⏱️ ~{slot.estimatedMinutes} min</span>
                        </div>
                        <GameCard game={slot.game} owners={slot.game.owners} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="draw-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={savingEvent}
                    onClick={() => void handleSaveAsEvent()}
                  >
                    {savingEvent ? "Saving Event…" : "📌 Save as Group Event"}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={handleCopyLineup}
                  >
                    {copied ? "✓ Copied to clipboard!" : "📋 Copy Menu"}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || savingEvent}
                    onClick={() => void handlePlanLineup(true)}
                  >
                    {busy ? "Regenerating…" : "🎲 Reroll Lineup"}
                  </button>
                </div>
              </div>
            )
          ) : !singleResult ? (
            <div>
              <h2>Let the group decide with a draw.</h2>
              <p>Choose the headcount and filters to see what fits your table.</p>
              <img className="draw-art" src="/brand/tablefolk-mark.png" alt="" />
            </div>
          ) : singleResult.status === "empty" ? (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>No shared games yet.</h2>
                <p>Ask group members to share games from their personal collections, then come back to draw.</p>
              </div>
            </div>
          ) : singleResult.status === "no_match" ? (
            <div className="no-match">
              <img src="/brand/tablefolk-mark.png" alt="" />
              <div>
                <h2>No single game fits the selected filters.</h2>
                <p>Try loosening the duration or complexity restrictions.</p>
                {singleResult.unknownPlayerCount > 0 && (
                  <p className="draw-hint">
                    {singleResult.unknownPlayerCount} {singleResult.unknownPlayerCount === 1 ? "game has" : "games have"} no player count listed and could not be included.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <span className="draw-result-intro">
                Your game night pick · {singleResult.eligibleCount} {singleResult.eligibleCount === 1 ? "game fits" : "games fit"}
              </span>
              <h2>
                Let&apos;s play {singleResult.game.name}
                {singleResult.game.expansions && singleResult.game.expansions.length > 0 && (
                  <span className="draw-title-expansions">
                    {" + "}{singleResult.game.expansions.map((e) => cleanExpansionName(singleResult.game.name, e.name)).join(", ")}
                  </span>
                )}
                .
              </h2>
              <GameCard game={singleResult.game} owners={singleResult.game.owners} />
              <p className="draw-hint">
                Check with a sharing member that they can bring it.
              </p>
              <div className="draw-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => void handleSinglePick(true)}
                >
                  {busy ? "Picking…" : "🎲 Pick another"}
                </button>
                {singleResult.onlyMatch && (
                  <span className="draw-hint">This is the only listed game that fits.</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
