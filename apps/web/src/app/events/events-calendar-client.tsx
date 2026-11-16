"use client";

import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventDetail } from "@tablefolk/contracts";
import { cleanExpansionName } from "@/components/game-card";
import { useApi } from "@/lib/api";

type ViewMode = "calendar" | "list";
type EventFilter = "all" | "attending" | "voting" | "completed";

export function EventsCalendarClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const api = useApi();

  const [events, setEvents] = useState<EventDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [filter, setFilter] = useState<EventFilter>("all");

  // Calendar month state (0-indexed month)
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api<{ events: EventDetail[] }>("/v1/events");
      setEvents(data.events);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, load]);

  async function handleRsvp(eventId: string, status: "ATTENDING" | "DECLINED" | "MAYBE", guests = 0) {
    try {
      await api(`/v1/events/${eventId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status, additionalGuests: guests }),
      });
      await load();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not update RSVP.");
    }
  }

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const myRsvp = e.rsvps.find((r) => r.userId === user?.id);
      if (filter === "attending") return myRsvp?.status === "ATTENDING";
      if (filter === "voting") return e.menuPoll?.status === "OPEN";
      if (filter === "completed") return e.status === "COMPLETED";
      return true;
    });
  }, [events, filter, user?.id]);

  // Calendar math
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday
  }, [currentYear, currentMonth]);

  const monthLabel = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [currentYear, currentMonth]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  }

  // Group events by day of the current month
  const eventsByDay = useMemo(() => {
    const map = new Map<number, EventDetail[]>();
    for (const e of filteredEvents) {
      const d = new Date(e.scheduledDate);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
        const day = d.getDate();
        const list = map.get(day) ?? [];
        list.push(e);
        map.set(day, list);
      }
    }
    return map;
  }, [filteredEvents, currentYear, currentMonth]);

  const selectedEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) ?? null;
  }, [events, selectedEventId]);

  if (!isLoaded || loading) {
    return (
      <div className="page">
        <p className="loading">Loading calendar and events…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="page">
        <div className="panel empty-state">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h1>Sign in to view your events</h1>
            <p>Access game nights, lineups, and calendar schedules across all your groups.</p>
            <Link className="button" href="/sign-in">Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Tablefolk Events</span>
          <h1>Group Game Night Calendar</h1>
          <p className="lead">
            Every gathering, voting poll, and official game menu across all your groups in one place.
          </p>
        </div>

        <div className="header-actions" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="view-mode-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "calendar" ? "active" : ""}`}
              onClick={() => setViewMode("calendar")}
            >
              📅 Calendar
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
            >
              📋 Upcoming List ({filteredEvents.length})
            </button>
          </div>

          <Link href="/groups" className="button-secondary">
            Browse Groups →
          </Link>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}

      {/* Filter Tabs */}
      <div className="filter-chips" style={{ display: "flex", gap: "8px", margin: "16px 0", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`filter-chip ${filter === "all" ? "filter-chip-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({events.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "attending" ? "filter-chip-active" : ""}`}
          onClick={() => setFilter("attending")}
        >
          ✓ My RSVPs ({events.filter((e) => e.rsvps.some((r) => r.userId === user?.id && r.status === "ATTENDING")).length})
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "voting" ? "filter-chip-active" : ""}`}
          onClick={() => setFilter("voting")}
        >
          🗳️ Voting Active ({events.filter((e) => e.menuPoll?.status === "OPEN").length})
        </button>
        <button
          type="button"
          className={`filter-chip ${filter === "completed" ? "filter-chip-active" : ""}`}
          onClick={() => setFilter("completed")}
        >
          🏁 Past & Completed ({events.filter((e) => e.status === "COMPLETED").length})
        </button>
      </div>

      {events.length === 0 ? (
        <div className="panel empty-state">
          <img src="/brand/tablefolk-mark.png" alt="" />
          <div>
            <h2>No game night events yet</h2>
            <p>You haven&apos;t joined any groups with scheduled events yet. Create a group or ask a friend for an invite link!</p>
            <Link className="button" href="/groups">Explore Groups</Link>
          </div>
        </div>
      ) : viewMode === "calendar" ? (
        <section className="panel calendar-panel">
          {/* Calendar Header Navigation */}
          <div className="calendar-nav-bar">
            <div className="calendar-month-title">
              <h2>{monthLabel}</h2>
            </div>
            <div className="calendar-nav-buttons">
              <button type="button" className="button-secondary button-small" onClick={prevMonth}>
                ← Prev
              </button>
              <button type="button" className="button-quiet button-small" onClick={goToToday}>
                Today
              </button>
              <button type="button" className="button-secondary button-small" onClick={nextMonth}>
                Next →
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="calendar-grid-header">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Calendar Day Grid */}
          <div className="calendar-grid">
            {/* Empty offset padding for days before the 1st */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="calendar-day-cell calendar-day-empty" />
            ))}

            {/* Days of the Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday =
                today.getFullYear() === currentYear &&
                today.getMonth() === currentMonth &&
                today.getDate() === day;
              const dayEvents = eventsByDay.get(day) ?? [];

              return (
                <div
                  key={`day-${day}`}
                  className={`calendar-day-cell ${isToday ? "calendar-day-today" : ""} ${dayEvents.length > 0 ? "has-events" : ""}`}
                >
                  <div className="calendar-day-number">
                    <span>{day}</span>
                    {dayEvents.length > 0 && <span className="day-count-badge">{dayEvents.length}</span>}
                  </div>

                  <div className="calendar-day-events">
                    {dayEvents.map((evt) => {
                      const isSelected = selectedEventId === evt.id;
                      const hasVote = evt.menuPoll?.status === "OPEN";
                      const isOfficial = evt.officialLineup?.length || evt.officialPick;
                      const myRsvp = evt.rsvps.find((r) => r.userId === user?.id);

                      return (
                        <button
                          key={evt.id}
                          type="button"
                          className={`calendar-event-pill ${isSelected ? "selected" : ""} ${hasVote ? "pill-vote" : ""} ${evt.status === "COMPLETED" ? "pill-completed" : ""}`}
                          onClick={() => setSelectedEventId(evt.id)}
                          title={`${evt.groupName ? `[${evt.groupName}] ` : ""}${evt.title}`}
                        >
                          <span className="pill-time">
                            {new Date(evt.scheduledDate).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="pill-title">{evt.title}</span>
                          {hasVote && <span className="pill-badge" title="Menu voting open">🗳️</span>}
                          {isOfficial && !hasVote && <span className="pill-badge" title="Official lineup locked">🎲</span>}
                          {myRsvp?.status === "ATTENDING" && <span className="pill-badge-rsvp">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Event Card Preview */}
          {selectedEvent && (
            <div className="panel selected-event-preview" style={{ marginTop: "24px", border: "2px solid var(--accent, #d97706)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span className="eyebrow">
                    {selectedEvent.groupName ? `👥 ${selectedEvent.groupName} · ` : ""}
                    {new Date(selectedEvent.scheduledDate).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <h3 style={{ margin: "4px 0" }}>{selectedEvent.title}</h3>
                  {selectedEvent.location && <p className="event-location" style={{ margin: "2px 0" }}>📍 {selectedEvent.location}</p>}
                  {selectedEvent.hostDisplayName && <p className="event-host" style={{ margin: "2px 0" }}>🏠 Host: {selectedEvent.hostDisplayName}</p>}
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="headcount-badge">👥 {selectedEvent.totalHeadcount} players</span>
                  <Link
                    href={`/groups/${selectedEvent.groupId}/events/${selectedEvent.id}`}
                    className="button"
                  >
                    Enter Event Room →
                  </Link>
                </div>
              </div>

              {selectedEvent.menuPoll?.status === "OPEN" && (
                <div style={{ marginTop: "12px", padding: "10px", background: "var(--ground, #fdf6ec)", borderRadius: "8px", border: "1px solid #fde68a" }}>
                  <strong>🗳️ 3 Menu Options Voting Active!</strong> Attendees are currently voting on tonight&apos;s menu.
                </div>
              )}

              {selectedEvent.officialLineup && selectedEvent.officialLineup.length > 0 && (
                <div style={{ marginTop: "10px", fontSize: "13px" }}>
                  <strong>🎲 Official Lineup:</strong>{" "}
                  {selectedEvent.officialLineup.map((s, idx) => (
                    <span key={s.bggId}>
                      {idx > 0 && " → "}
                      {s.name} ({s.label})
                    </span>
                  ))}
                </div>
              )}

              {selectedEvent.status === "COMPLETED" && (
                <div style={{ marginTop: "10px", fontSize: "13px", color: "#15803d" }}>
                  <strong>🏁 Game Night Completed</strong>
                  {selectedEvent.playedGames && selectedEvent.playedGames.length > 0 && (
                    <span> · Actually played: {selectedEvent.playedGames.map((g) => g.name).join(", ")}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        /* Timeline / List View */
        <div className="events-list">
          {filteredEvents.length === 0 ? (
            <p className="empty">No events match the selected filter.</p>
          ) : (
            filteredEvents.map((event) => {
              const myRsvp = event.rsvps.find((r) => r.userId === user?.id);
              const attendingList = event.rsvps.filter((r) => r.status === "ATTENDING");

              return (
                <article key={event.id} className="panel event-card">
                  <div className="event-card-header">
                    <div>
                      <span className="eyebrow">
                        {event.groupName && <strong style={{ color: "var(--accent, #d97706)" }}>{event.groupName} · </strong>}
                        {new Date(event.scheduledDate).toLocaleDateString(undefined, {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <h2>{event.title}</h2>
                      {event.location && <p className="event-location">📍 {event.location}</p>}
                      {event.hostDisplayName && (
                        <p className="event-host">🏠 Host: <strong>{event.hostDisplayName}</strong></p>
                      )}
                    </div>
                    <div className="headcount-badge">
                      <strong>{event.totalHeadcount}</strong> players attending
                    </div>
                  </div>

                  {/* Voting Banner */}
                  {event.menuPoll?.status === "OPEN" && (
                    <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>🗳️ <strong>Voting Open:</strong> Group is deciding between 3 curated game menus!</span>
                      <Link href={`/groups/${event.groupId}/events/${event.id}`} className="button-small">
                        Cast Vote
                      </Link>
                    </div>
                  )}

                  {/* Official Lineup / Pick */}
                  {(event.officialPick || (event.officialLineup && event.officialLineup.length > 0)) && (
                    <div className="event-official-badge-card">
                      <span className="official-tag">🎲 Official Selection:</span>
                      {event.officialPick && (
                        <span className="official-game-name">
                          <strong>{event.officialPick.name}</strong>
                          {event.officialPickCarrier && ` · 🎒 ${event.officialPickCarrier}`}
                        </span>
                      )}
                      {event.officialLineup && event.officialLineup.length > 0 && (
                        <span className="official-lineup-names">
                          {event.officialLineup.map((s, idx) => (
                            <span key={s.bggId} className="official-lineup-item">
                              {idx > 0 && " → "}
                              <strong>{s.name}</strong> ({s.label})
                              {s.carrierDisplayName && ` [🎒 ${s.carrierDisplayName}]`}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Completed status with actually played games */}
                  {event.status === "COMPLETED" && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}>
                      <span style={{ fontWeight: 700, color: "#166534" }}>🏁 Event Completed</span>
                      {event.playedGames && event.playedGames.length > 0 ? (
                        <span> — Actually played: <strong>{event.playedGames.map((g) => g.name).join(", ")}</strong></span>
                      ) : (
                        <span> — Games night wrapped up.</span>
                      )}
                    </div>
                  )}

                  {event.description && <p className="event-description">{event.description}</p>}

                  {/* RSVP Controls */}
                  <div className="event-rsvp-bar">
                    <span className="rsvp-label">Your RSVP:</span>
                    <button
                      type="button"
                      className={`button-small ${myRsvp?.status === "ATTENDING" ? "button" : "button-secondary"}`}
                      onClick={() => void handleRsvp(event.id, "ATTENDING", myRsvp?.additionalGuests ?? 0)}
                    >
                      ✓ Attending
                    </button>
                    <button
                      type="button"
                      className={`button-small ${myRsvp?.status === "MAYBE" ? "button" : "button-secondary"}`}
                      onClick={() => void handleRsvp(event.id, "MAYBE", myRsvp?.additionalGuests ?? 0)}
                    >
                      ? Maybe
                    </button>
                    <button
                      type="button"
                      className={`button-small ${myRsvp?.status === "DECLINED" ? "button-danger" : "button-secondary"}`}
                      onClick={() => void handleRsvp(event.id, "DECLINED", 0)}
                    >
                      ✕ Can&apos;t go
                    </button>

                    {myRsvp?.status === "ATTENDING" && (
                      <div className="guests-stepper">
                        <span>+Guests:</span>
                        <button
                          type="button"
                          className="button-quiet button-small"
                          disabled={myRsvp.additionalGuests <= 0}
                          onClick={() => void handleRsvp(event.id, "ATTENDING", myRsvp.additionalGuests - 1)}
                        >
                          -
                        </button>
                        <strong>{myRsvp.additionalGuests}</strong>
                        <button
                          type="button"
                          className="button-quiet button-small"
                          onClick={() => void handleRsvp(event.id, "ATTENDING", myRsvp.additionalGuests + 1)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Attendees Summary */}
                  <div className="event-attendees">
                    <strong>Attendees:</strong>{" "}
                    {attendingList.length === 0
                      ? "Nobody confirmed yet."
                      : attendingList.map((r, i) => (
                          <span key={r.userId}>
                            {i > 0 && ", "}
                            {r.displayName}
                            {r.additionalGuests > 0 && ` (+${r.additionalGuests})`}
                          </span>
                        ))}
                  </div>

                  <div className="event-card-actions">
                    <Link
                      href={`/groups/${event.groupId}/events/${event.id}`}
                      className="button"
                    >
                      Enter Game Night Room & Pick →
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
