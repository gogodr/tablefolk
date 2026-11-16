"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState, useRef } from "react";
import type {
  EventDetail,
  EventMenuOption,
  EventMenuPoll,
  GroupGame,
  PickResult,
  SessionLineupResult,
  SessionMenuTrioResult,
} from "@tablefolk/contracts";
import { GameCard, cleanExpansionName } from "@/components/game-card";
import { useApi } from "@/lib/api";

type Mode = "lineup" | "single";

export function EventClient() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const api = useApi();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

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

  // 3-Menu Trio & Poll controls
  const [trioResult, setTrioResult] = useState<SessionMenuTrioResult | null>(null);
  const [planningTrio, setPlanningTrio] = useState(false);
  const [voting, setVoting] = useState(false);

  // Close Event Modal & Actual Played Games
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingEvent, setClosingEvent] = useState(false);
  const [groupGamesList, setGroupGamesList] = useState<GroupGame[]>([]);
  const [playedGameIds, setPlayedGameIds] = useState<number[]>([]);
  const [showOtherGames, setShowOtherGames] = useState(false);
  const closeDialogRef = useRef<HTMLDialogElement>(null);

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

  async function handlePlanTrio() {
    if (!playerCount || playerCount <= 0) return;
    setPlanningTrio(true);
    setError("");

    try {
      const data = await api<SessionMenuTrioResult>(`/v1/events/${eventId}/menu-trio`, {
        method: "POST",
        body: JSON.stringify({
          playerCount,
          totalMinutes,
          allowHeavy,
        }),
      });
      setTrioResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not plan 3 menu options.");
    } finally {
      setPlanningTrio(false);
    }
  }

  async function handleOpenPoll(options: EventMenuOption[]) {
    setVoting(true);
    setError("");
    try {
      const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}/menu-poll/open`, {
        method: "POST",
        body: JSON.stringify({ options }),
      });
      setEvent(res.event);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open voting poll.");
    } finally {
      setVoting(false);
    }
  }

  async function handleVoteOption(optionId: string) {
    setVoting(true);
    try {
      const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}/menu-poll/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
      });
      setEvent(res.event);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not record vote.");
    } finally {
      setVoting(false);
    }
  }

  async function handleClosePoll(winningOptionId?: string) {
    setVoting(true);
    try {
      const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}/menu-poll/close`, {
        method: "POST",
        body: JSON.stringify({ winningOptionId }),
      });
      setEvent(res.event);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not lock winning menu.");
    } finally {
      setVoting(false);
    }
  }

  function handleCopyPollText(pollOptions: EventMenuOption[]) {
    if (!event || !pollOptions || pollOptions.length === 0) return;

    const dateFormatted = new Date(event.scheduledDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let message = `🎲 *¡Votemos el menú de juegos para ${event.title}!* 🗳️\n`;
    message += `📅 ${dateFormatted}\n`;
    if (event.location) message += `📍 ${event.location}\n`;
    message += `👥 ${event.totalHeadcount} confirmados\n\n`;
    message += `*Elige tu opción favorita para la noche:*\n\n`;

    pollOptions.forEach((opt) => {
      message += `🔹 *${opt.title}* (${opt.styleBadge}) · ~${opt.totalEstimatedMinutes} min\n`;
      opt.lineup.forEach((slot) => {
        const expStr = slot.game.expansions?.length
          ? ` (+ ${slot.game.expansions.map((e) => cleanExpansionName(slot.game.name, e.name)).join(", ")})`
          : "";
        message += `  • ${slot.label}: *${slot.game.name}*${expStr} (~${slot.estimatedMinutes}m)\n`;
      });
      message += `  💬 ${opt.description}\n\n`;
    });

    if (typeof window !== "undefined") {
      message += `🔗 Vota directamente en Tablefolk:\n${window.location.href}`;
      void navigator.clipboard.writeText(message);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    }
  }

  async function handleOpenCloseEventModal() {
    const defaultIds: number[] = [];
    if (event?.officialLineup && event.officialLineup.length > 0) {
      event.officialLineup.forEach((s) => defaultIds.push(s.bggId));
    } else if (event?.officialPickBggId) {
      defaultIds.push(event.officialPickBggId);
    }
    setPlayedGameIds(defaultIds);

    try {
      const data = await api<{ games: GroupGame[] }>(`/v1/groups/${groupId}/games`);
      setGroupGamesList(data.games);
    } catch {
      // ignore
    }
    setShowCloseModal(true);
  }

  function handleTogglePlayedGame(bggId: number) {
    setPlayedGameIds((prev) =>
      prev.includes(bggId) ? prev.filter((id) => id !== bggId) : [...prev, bggId]
    );
  }

  async function handleConfirmCloseEvent() {
    setClosingEvent(true);
    try {
      const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}/close`, {
        method: "POST",
        body: JSON.stringify({ playedBggIds: playedGameIds }),
      });
      setEvent(res.event);
      setShowCloseModal(false);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not close event.");
    } finally {
      setClosingEvent(false);
    }
  }

  function resolveCarrier(owners: { displayName: string; isAvailable?: boolean }[]): string | undefined {
    if (!owners || owners.length === 0) return undefined;
    // Prefer host if they own it
    if (event?.hostDisplayName) {
      const hostOwner = owners.find((o) => o.displayName === event.hostDisplayName && o.isAvailable !== false);
      if (hostOwner) return `${hostOwner.displayName} (Host)`;
    }
    // Otherwise the first available owner among attendees
    const availableOwner = owners.find((o) => o.isAvailable !== false);
    return availableOwner ? availableOwner.displayName : owners[0]?.displayName;
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
        const carrier = resolveCarrier(singleResult.game.owners);
        await api(`/v1/events/${eventId}/official`, {
          method: "PUT",
          body: JSON.stringify({
            type: "single",
            bggId: singleResult.game.bggId,
            carrierDisplayName: carrier,
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
              carrierDisplayName: resolveCarrier(s.game.owners),
              expansions: s.game.expansions?.map((e) => ({ bggId: e.bggId, name: e.name })),
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

  function handleCopyShareText() {
    if (!event) return;
    const dateFormatted = new Date(event.scheduledDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let message = `🎲 *${event.title}*\n`;
    message += `📅 ${dateFormatted}\n`;
    if (event.location) message += `📍 ${event.location}\n`;
    if (event.hostDisplayName) message += `🏠 Host: ${event.hostDisplayName}\n`;
    message += `👥 ${event.totalHeadcount} confirmados\n\n`;

    if (event.officialPick) {
      message += `✨ *Juego Oficial de la Noche:*\n`;
      message += `👉 *${event.officialPick.name}*`;
      if (event.officialPickCarrier) message += ` (Lo lleva: ${event.officialPickCarrier})`;
      message += `\n📺 Cómo jugar: https://www.youtube.com/results?search_query=how+to+play+${encodeURIComponent(event.officialPick.name)}+board+game\n\n`;
    } else if (event.officialLineup && event.officialLineup.length > 0) {
      message += `✨ *Menú de Sesión Programado:*\n`;
      event.officialLineup.forEach((slot, i) => {
        const expStr = slot.expansions && slot.expansions.length > 0
          ? ` (+ ${slot.expansions.map((e) => cleanExpansionName(slot.name, e.name)).join(", ")})`
          : "";
        message += `${i + 1}️⃣ *${slot.name}*${expStr} (${slot.label} · ~${slot.estimatedMinutes}m)`;
        if (slot.carrierDisplayName) message += ` [Lo lleva: ${slot.carrierDisplayName}]`;
        message += `\n`;
      });
      message += `\n`;
    }

    if (typeof window !== "undefined") {
      message += `🔗 Ver en Tablefolk: ${window.location.href}`;
      void navigator.clipboard.writeText(message);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    }
  }

  function getGoogleCalendarUrl(): string {
    if (!event) return "#";
    const startDate = new Date(event.scheduledDate);
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000); // +3 hours default

    const formatGDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const dates = `${formatGDate(startDate)}/${formatGDate(endDate)}`;

    let details = `${event.description || "Game night session"}\n\n`;
    if (event.officialPick) {
      details += `Featured Game: ${event.officialPick.name}\n`;
      if (event.officialPickCarrier) details += `Brought by: ${event.officialPickCarrier}\n`;
    } else if (event.officialLineup && event.officialLineup.length > 0) {
      details += `Session Lineup:\n` + event.officialLineup.map((s) => {
        const expStr = s.expansions?.length ? ` (+ ${s.expansions.map((e) => cleanExpansionName(s.name, e.name)).join(", ")})` : "";
        return `- ${s.name}${expStr} (${s.label})`;
      }).join("\n") + "\n";
    }
    if (typeof window !== "undefined") details += `\nEvent Link: ${window.location.href}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(event.location || "")}`;
  }

  function handleDownloadIcs() {
    if (!event) return;
    const startDate = new Date(event.scheduledDate);
    const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

    const formatIcsDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
    let summaryGame = "";
    if (event.officialPick) summaryGame = `\\nFeatured Game: ${event.officialPick.name}`;
    else if (event.officialLineup && event.officialLineup.length > 0) {
      summaryGame = `\\nLineup: ` + event.officialLineup.map((s) => {
        const expStr = s.expansions?.length ? ` (+ ${s.expansions.map((e) => cleanExpansionName(s.name, e.name)).join(", ")})` : "";
        return `${s.name}${expStr}`;
      }).join(", ");
    }

    const icsData = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tablefolk//Game Night//EN",
      "BEGIN:VEVENT",
      `UID:${event.id}@tablefolk`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${(event.description || "Tablefolk Game Night") + summaryGame}`,
      `LOCATION:${event.location || ""}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
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

          {/* Event Quick Actions Bar: Share WhatsApp & Calendar */}
          <div className="event-quick-actions">
            {isHostOrCreator && event?.status === "SCHEDULED" && (
              <button
                type="button"
                className="button-small"
                style={{ background: "#15803d", color: "#fff", borderColor: "#166534" }}
                onClick={() => void handleOpenCloseEventModal()}
              >
                🏁 Finish & Record Played Games
              </button>
            )}
            {isHostOrCreator && event?.status === "COMPLETED" && (
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => void handleOpenCloseEventModal()}
              >
                ✏️ Edit Played Games
              </button>
            )}
            <button
              type="button"
              className="button-secondary button-small"
              onClick={handleCopyShareText}
            >
              {copiedShare ? "✓ Copied to Clipboard!" : "📋 Copy WhatsApp / Discord Summary"}
            </button>
            <a
              href={getGoogleCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="button-quiet button-small"
            >
              📅 Add to Google Calendar
            </a>
            <button
              type="button"
              className="button-quiet button-small"
              onClick={handleDownloadIcs}
            >
              📥 Download .ICS
            </button>
          </div>
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

      {/* Completed Event Status Banner */}
      {event?.status === "COMPLETED" && (
        <section className="panel" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <span className="eyebrow" style={{ color: "#166534" }}>🏁 Event Finished &amp; Verified</span>
              <h2 style={{ margin: "4px 0", color: "#14532d" }}>Game Night Completed</h2>
              <p style={{ margin: "4px 0", fontSize: "14px", color: "#166534" }}>
                Los puntos de deseo/interés de los miembros se descontaron únicamente de los títulos jugados a continuación.
              </p>
            </div>
            {isHostOrCreator && (
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => void handleOpenCloseEventModal()}
              >
                ✏️ Edit Played Games
              </button>
            )}
          </div>

          <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {event.playedGames && event.playedGames.length > 0 ? (
              event.playedGames.map((g) => (
                <div
                  key={g.bggId}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>🎲</span>
                  <strong>{g.name}</strong>
                  {g.weight && <span style={{ fontSize: "11px", color: "var(--muted)" }}>(Weight {g.weight.toFixed(1)})</span>}
                </div>
              ))
            ) : (
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>No specific games marked as played.</p>
            )}
          </div>
        </section>
      )}

      {/* Active Group Voting Poll Banner */}
      {event?.menuPoll?.status === "OPEN" && event.menuPoll.options.length > 0 && (
        <section className="panel" style={{ background: "#fffbeb", border: "2px solid #f59e0b", marginBottom: "24px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div>
              <span className="eyebrow" style={{ color: "#b45309" }}>🗳️ Group Voting in Progress</span>
              <h2 style={{ margin: "4px 0" }}>Which Game Night Menu should we play?</h2>
              <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
                The host proposed 3 balanced menus. Vote below for your preferred lineup!
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => handleCopyPollText(event.menuPoll!.options)}
              >
                {copiedShare ? "✓ Copied Poll!" : "📋 Copy Poll for WhatsApp / Discord"}
              </button>
              {isHostOrCreator && (
                <button
                  type="button"
                  className="button button-small"
                  disabled={voting}
                  onClick={() => void handleClosePoll()}
                >
                  {voting ? "Locking…" : "🏆 Lock Winning Menu"}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            {event.menuPoll.options.map((opt) => {
              const myVote = opt.votes.some((v) => v.userId === user?.id);
              const voteCount = opt.votes.length;

              return (
                <div
                  key={opt.id}
                  className="panel"
                  style={{
                    background: myVote ? "#fef3c7" : "#ffffff",
                    border: myVote ? "2px solid #d97706" : "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "16px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                      <span className="slot-role-badge" style={{ fontSize: "11px" }}>{opt.styleBadge}</span>
                      <span className="headcount-badge" style={{ padding: "3px 8px", fontSize: "11px", fontWeight: 700 }}>
                        🗳️ {voteCount} {voteCount === 1 ? "vote" : "votes"}
                      </span>
                    </div>

                    <h3 style={{ margin: "10px 0 6px", fontSize: "17px" }}>{opt.title}</h3>
                    <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)" }}>{opt.description}</p>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                      {opt.lineup.map((slot) => (
                        <div
                          key={slot.game.bggId}
                          style={{
                            background: "var(--color-paper, #f9fafb)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "6px 10px",
                            fontSize: "12px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong>{slot.label}: {slot.game.name}</strong>
                            <span style={{ color: "var(--muted)" }}>~{slot.estimatedMinutes}m</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
                      ⏱️ <strong>~{opt.totalEstimatedMinutes} min total</strong>
                      {opt.transitionMinutes ? ` (${opt.transitionMinutes}m setup &amp; buffer)` : ""}
                    </div>

                    {opt.votes.length > 0 && (
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "12px" }}>
                        <strong>Voters:</strong> {opt.votes.map((v) => v.displayName).join(", ")}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className={`button-small ${myVote ? "button" : "button-secondary"}`}
                      style={{ flex: 1 }}
                      disabled={voting}
                      onClick={() => void handleVoteOption(opt.id)}
                    >
                      {myVote ? "✓ Your Vote" : "🗳️ Vote for This"}
                    </button>
                    {isHostOrCreator && (
                      <button
                        type="button"
                        className="button-quiet button-small"
                        title="Lock this specific option as official"
                        disabled={voting}
                        onClick={() => void handleClosePoll(opt.id)}
                      >
                        Set Winner
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
              <div className="official-pick-meta">
                <span className="slot-role-badge">Featured Game</span>
                {event.officialPickCarrier && (
                  <span className="carrier-badge">🎒 Bringer: <strong>{event.officialPickCarrier}</strong></span>
                )}
                <a
                  href={`https://www.youtube.com/results?search_query=how+to+play+${encodeURIComponent(event.officialPick.name)}+board+game`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rules-video-link"
                >
                  ▶ Watch How to Play
                </a>
              </div>
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
                      {slot.carrierDisplayName && (
                        <span className="carrier-badge">🎒 {slot.carrierDisplayName}</span>
                      )}
                    </div>
                    <div className="lineup-slot-title-row">
                      <h3>
                        {slot.name}
                        {slot.expansions && slot.expansions.length > 0 && (
                          <span className="game-attached-expansions-tag">
                            {" + "}{slot.expansions.map((e) => cleanExpansionName(slot.name, e.name)).join(", ")}
                          </span>
                        )}
                      </h3>
                      <a
                        href={`https://www.youtube.com/results?search_query=how+to+play+${encodeURIComponent(slot.name)}+board+game`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rules-video-link"
                      >
                        ▶ Rules Video
                      </a>
                    </div>
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
          <div className="draw-card-header">
            <h2>{mode === "lineup" ? "Session Menu Planner" : "Single Pick Filters"}</h2>
            <p>
              {mode === "lineup"
                ? "Plan a balanced evening matching your total gathering duration, pairing a main game with warm-up/cooldown fillers (max 1 heavy game)."
                : "Draw 1 title matching your attendees headcount, duration, and complexity."}
            </p>
          </div>

          <div className="draw-card-form">
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

                <label className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={allowHeavy}
                    onChange={(e) => setAllowHeavy(e.target.checked)}
                  />
                  <span>Allow a Heavy game (Weight &gt; 3.2 · Anti-fatigue rule limits to max 1)</span>
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="button button-large"
                    disabled={picking || planningTrio || playerCount <= 0}
                    onClick={() => {
                      setTrioResult(null);
                      void handlePlanLineup(false);
                    }}
                  >
                    {picking ? "Composing Lineup…" : "✨ Plan Single Session Menu"}
                  </button>

                  <button
                    type="button"
                    className="button-secondary button-large"
                    disabled={picking || planningTrio || playerCount <= 0}
                    onClick={() => {
                      setLineupResult(null);
                      void handlePlanTrio();
                    }}
                  >
                    {planningTrio ? "Composing 3 Options…" : "🗳️ Plan 3 Options for Group Vote"}
                  </button>
                </div>
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
          </div>
        </section>

        {/* Results Section */}
        <section className="draw-card draw-result" aria-live="polite">
          {mode === "lineup" ? (
            trioResult && trioResult.status === "success" ? (
              <div>
                <span className="draw-result-intro">
                  ✨ 3 Contrasting Session Menus Generated · Compare or open group voting
                </span>
                <h2>Compare Tonight&apos;s 3 Menu Options</h2>

                {isHostOrCreator && event?.menuPoll?.status !== "OPEN" && (
                  <div style={{ margin: "14px 0", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button"
                      disabled={voting}
                      onClick={() => void handleOpenPoll(trioResult.options)}
                    >
                      {voting ? "Opening Poll…" : "🗳️ Open Group Voting on these 3 Menus"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => handleCopyPollText(trioResult.options)}
                    >
                      📋 Copy Poll for WhatsApp / Discord
                    </button>
                    <button
                      type="button"
                      className="button-quiet button-small"
                      disabled={planningTrio}
                      onClick={() => void handlePlanTrio()}
                    >
                      🎲 Reroll 3 Options
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "16px" }}>
                  {trioResult.options.map((opt) => (
                    <div key={opt.id} className="panel" style={{ padding: "18px", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <span className="slot-role-badge">{opt.styleBadge}</span>
                          <h3 style={{ margin: "6px 0 2px", fontSize: "18px" }}>{opt.title}</h3>
                          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>{opt.description}</p>
                        </div>
                        <span className="slot-time-badge">⏱️ ~{opt.totalEstimatedMinutes} min</span>
                      </div>

                      <div className="lineup-slots" style={{ marginTop: "12px" }}>
                        {opt.lineup.map((slot, idx) => (
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
                    </div>
                  ))}
                </div>
              </div>
            ) : !lineupResult ? (
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
              <h2>
                Let&apos;s play {singleResult.game.name}
                {singleResult.game.expansions && singleResult.game.expansions.length > 0 && (
                  <span className="draw-title-expansions">
                    {" + "}{singleResult.game.expansions.map((e) => cleanExpansionName(singleResult.game.name, e.name)).join(", ")}
                  </span>
                )}
                !
              </h2>
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

      {/* Close Event Modal & Actual Played Games */}
      {showCloseModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setShowCloseModal(false)}
        >
          <div
            className="panel"
            style={{
              maxWidth: "600px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              background: "var(--color-card, #ffffff)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
              <div>
                <span className="eyebrow" style={{ color: "#166534" }}>🏁 Finalizar Noche de Juegos</span>
                <h2 style={{ margin: "4px 0" }}>¿Qué juegos se jugaron realmente?</h2>
              </div>
              <button
                type="button"
                className="button-quiet button-small"
                onClick={() => setShowCloseModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "14px", color: "var(--muted)", margin: "10px 0 16px", lineHeight: "1.5" }}>
              Marca los juegos que efectivamente llegaron a mesa hoy.
              {" "}<strong>Los puntos de deseo/interés de los asistentes solo se descontarán de los títulos jugados</strong>.
              Cualquier juego planificado que no se llegó a jugar conservará sus votos intactos.
            </p>

            {/* Planned games section */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Juegos planificados en este evento
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {event?.officialLineup && event.officialLineup.length > 0 ? (
                  event.officialLineup.map((s) => {
                    const checked = playedGameIds.includes(s.bggId);
                    return (
                      <label
                        key={s.bggId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px",
                          borderRadius: "8px",
                          border: checked ? "2px solid #16a34a" : "1px solid var(--border)",
                          background: checked ? "#f0fdf4" : "var(--color-paper, #f9fafb)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleTogglePlayedGame(s.bggId)}
                          style={{ width: "18px", height: "18px" }}
                        />
                        <div style={{ flex: 1 }}>
                          <strong>{s.name}</strong>
                          <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--muted)" }}>({s.label})</span>
                        </div>
                      </label>
                    );
                  })
                ) : event?.officialPick ? (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px",
                      borderRadius: "8px",
                      border: playedGameIds.includes(event.officialPick.bggId) ? "2px solid #16a34a" : "1px solid var(--border)",
                      background: playedGameIds.includes(event.officialPick.bggId) ? "#f0fdf4" : "var(--color-paper, #f9fafb)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={playedGameIds.includes(event.officialPick.bggId)}
                      onChange={() => handleTogglePlayedGame(event.officialPick!.bggId)}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <div style={{ flex: 1 }}>
                      <strong>{event.officialPick.name}</strong>
                      <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--muted)" }}>(Juego Oficial)</span>
                    </div>
                  </label>
                ) : (
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>No había un juego oficial pre-bloqueado.</p>
                )}
              </div>
            </div>

            {/* Other games toggle */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginBottom: "16px" }}>
              <button
                type="button"
                className="button-quiet button-small"
                onClick={() => setShowOtherGames((v) => !v)}
              >
                {showOtherGames ? "▲ Ocultar otros juegos del grupo" : "➕ ¿Se jugó otro juego del grupo que no estaba en el menú?"}
              </button>

              {showOtherGames && (
                <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                  {groupGamesList.map((g) => {
                    const checked = playedGameIds.includes(g.bggId);
                    return (
                      <label
                        key={g.bggId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: checked ? "1px solid #16a34a" : "1px solid var(--border)",
                          background: checked ? "#f0fdf4" : "transparent",
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleTogglePlayedGame(g.bggId)}
                        />
                        <span>{g.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="button-secondary"
                disabled={closingEvent}
                onClick={() => setShowCloseModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button"
                style={{ background: "#15803d", borderColor: "#166534" }}
                disabled={closingEvent}
                onClick={() => void handleConfirmCloseEvent()}
              >
                {closingEvent ? "Cerrando…" : `Confirmar y Cerrar (${playedGameIds.length} jugados)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
