"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EventDetail } from "@tablefolk/contracts";
import { cleanExpansionName } from "@/components/game-card";
import { GuestRsvpModal } from "@/components/guest-rsvp-modal";
import { useApi } from "@/lib/api";
import { queryKeys, useGroupDetailQuery, useGroupEventsQuery } from "@/lib/queries";

export function EventsClient() {
  const { groupId } = useParams<{ groupId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data: groupData, isLoading: groupLoading } = useGroupDetailQuery(groupId);
  const { data: eventsData, isLoading: eventsLoading } = useGroupEventsQuery(groupId);

  const group = groupData?.group ?? null;
  const events = eventsData?.events ?? [];
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");
  const [managingGuestsEvent, setManagingGuestsEvent] = useState<EventDetail | null>(null);

  // Form state
  const [title, setTitle] = useState("Friday Game Night");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [location, setLocation] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [manualHeadcount, setManualHeadcount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group?.members && group.members.length > 0 && !hostUserId) {
      setHostUserId(group.members[0]?.userId ?? "");
    }
  }, [group, hostUserId]);

  const refreshEvents = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.events }),
    ]);
  }, [groupId, queryClient]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filter === "upcoming") return e.status !== "COMPLETED";
      if (filter === "completed") return e.status === "COMPLETED";
      return true;
    });
  }, [events, filter]);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !scheduledDate) return;
    setSaving(true);
    try {
      await api(`/v1/groups/${groupId}/events`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledDate: new Date(scheduledDate).toISOString(),
          location: location.trim() || undefined,
          hostUserId: hostUserId || undefined,
          manualHeadcount: manualHeadcount ? Number(manualHeadcount) : undefined,
        }),
      });
      setShowCreateModal(false);
      setTitle("Friday Game Night");
      setDescription("");
      setLocation("");
      await refreshEvents();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not schedule event.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRsvp(
    eventId: string,
    status: "ATTENDING" | "DECLINED" | "MAYBE",
    guestNames: string[] = []
  ) {
    try {
      await api(`/v1/events/${eventId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status, guestNames, additionalGuests: guestNames.length }),
      });
      await refreshEvents();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not update RSVP.");
    }
  }

  function renderEventCard(event: EventDetail) {
    const myRsvp = event.rsvps.find((r) => r.userId === user?.id);
    const attendingList = event.rsvps.filter((r) => r.status === "ATTENDING");
    const isCompleted = event.status === "COMPLETED";

    return (
      <article key={event.id} className="panel event-card">
        <div className="event-card-header">
          <div>
            <span className="eyebrow">
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
          <div
            className="headcount-badge"
            style={isCompleted ? { background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" } : undefined}
          >
            {isCompleted ? (
              <strong>🏁 Completed · {event.totalHeadcount} attended</strong>
            ) : (
              <><strong>{event.totalHeadcount}</strong> players attending</>
            )}
          </div>
        </div>

        {/* Announced Official Pick / Lineup if present */}
        {(event.officialPick || (event.officialLineup && event.officialLineup.length > 0)) && !isCompleted && (
          <div className="event-official-badge-card">
            <span className="official-tag">🎲 Official Selection:</span>
            {event.officialPick && (
              <span className="official-game-name">
                <strong>{event.officialPick.name}</strong>
                {event.officialPick.weight && ` (Weight ${event.officialPick.weight.toFixed(1)})`}
                {event.officialPickCarrier && ` · 🎒 ${event.officialPickCarrier}`}
              </span>
            )}
            {event.officialLineup && event.officialLineup.length > 0 && (
              <span className="official-lineup-names">
                {event.officialLineup.map((s, idx) => (
                  <span key={s.bggId} className="official-lineup-item">
                    {idx > 0 && " → "}
                    <strong>
                      {s.name}
                      {s.expansions && s.expansions.length > 0 && (
                        <span className="game-attached-expansions-tag">
                          {" + "}{s.expansions.map((e) => cleanExpansionName(s.name, e.name)).join(", ")}
                        </span>
                      )}
                    </strong> ({s.label})
                    {s.carrierDisplayName && ` [🎒 ${s.carrierDisplayName}]`}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}

        {/* Completed status with actually played games */}
        {isCompleted && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: "8px", fontSize: "13px" }}>
            <span style={{ fontWeight: 700, color: "#166534" }}>🏁 Event Completed</span>
            {event.playedGames && event.playedGames.length > 0 ? (
              <span> — Actually played: <strong>{event.playedGames.map((g) => g.name).join(", ")}</strong></span>
            ) : (
              <span> — Game night wrapped up.</span>
            )}
          </div>
        )}

        {event.description && <p className="event-description">{event.description}</p>}

        {/* RSVP Controls - ONLY active for upcoming / scheduled events */}
        {!isCompleted ? (
          <div className="event-rsvp-bar">
            <span className="rsvp-label">Your RSVP:</span>
            <button
              type="button"
              className={`button-small ${myRsvp?.status === "ATTENDING" ? "button" : "button-secondary"}`}
              onClick={() => void handleRsvp(event.id, "ATTENDING", myRsvp?.guestNames ?? [])}
            >
              ✓ Attending
            </button>
            <button
              type="button"
              className={`button-small ${myRsvp?.status === "MAYBE" ? "button" : "button-secondary"}`}
              onClick={() => void handleRsvp(event.id, "MAYBE", myRsvp?.guestNames ?? [])}
            >
              ? Maybe
            </button>
            <button
              type="button"
              className={`button-small ${myRsvp?.status === "DECLINED" ? "button-danger" : "button-secondary"}`}
              onClick={() => void handleRsvp(event.id, "DECLINED", [])}
            >
              ✕ Can&apos;t go
            </button>

            {myRsvp?.status === "ATTENDING" && (
              <button
                type="button"
                className="button-quiet button-small"
                onClick={() => setManagingGuestsEvent(event)}
                style={{ marginLeft: "8px", border: "1px dashed var(--border)", borderRadius: "6px" }}
              >
                👥 {myRsvp.guestNames && myRsvp.guestNames.length > 0
                  ? `+${myRsvp.guestNames.length} (${myRsvp.guestNames.join(", ")})`
                  : myRsvp.additionalGuests > 0
                  ? `+${myRsvp.additionalGuests} Guests`
                  : "+ Name Guests"}
              </button>
            )}
          </div>
        ) : (
          <div className="event-rsvp-bar" style={{ background: "transparent", padding: "4px 0", borderTop: "1px dashed var(--border)" }}>
            <span style={{ fontSize: "13px", color: myRsvp?.status === "ATTENDING" ? "#166534" : "var(--muted)", fontWeight: myRsvp?.status === "ATTENDING" ? 600 : 400 }}>
              {myRsvp?.status === "ATTENDING" ? "✓ You attended this session" : "You were marked as not attending"}
            </span>
          </div>
        )}

        {/* Attendees Summary */}
        <div className="event-attendees">
          <strong>{isCompleted ? "Confirmed Attendees:" : "Attendees:"}</strong>{" "}
          {attendingList.length === 0
            ? "Nobody confirmed yet."
            : attendingList.map((r, i) => (
                <span key={r.userId}>
                  {i > 0 && ", "}
                  <strong>{r.displayName}</strong>
                  {r.guestNames && r.guestNames.length > 0 ? (
                    <span style={{ color: "var(--muted)" }}> (+ {r.guestNames.join(", ")})</span>
                  ) : r.additionalGuests > 0 ? (
                    <span style={{ color: "var(--muted)" }}> (+{r.additionalGuests})</span>
                  ) : null}
                </span>
              ))}
        </div>

        <div className="event-card-actions">
          <Link
            href={`/groups/${groupId}/events/${event.id}`}
            className={isCompleted ? "button-secondary" : "button"}
          >
            {isCompleted ? "View Game Night Summary →" : "Enter Game Night Room & Pick"}
          </Link>
        </div>
      </article>
    );
  }

  const loading = !isLoaded || (isSignedIn && (groupLoading || eventsLoading));
  if (loading) return <div className="page"><p className="loading">Loading events…</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Sign in to view events.</h1>
        <Link href="/sign-in" className="button">Sign in</Link>
      </section>
    );
  }

  return (
    <div className="page">
      <Link href={`/groups/${groupId}`} className="back-link">← Back to {group?.name || "group"}</Link>
      <div className="page-header">
        <div>
          <h1>Game Night Events</h1>
          <p>Schedule sessions, confirm who is attending, and draw games tailored to the attendees.</p>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => setShowCreateModal(!showCreateModal)}
        >
          {showCreateModal ? "Cancel" : "+ Schedule Game Night"}
        </button>
      </div>

      {error && (
        <div className="state-message error" role="alert">
          <p>{error}</p>
          <button className="button-quiet" onClick={() => void refreshEvents()}>Try again</button>
        </div>
      )}

      {/* Schedule Event Form */}
      {showCreateModal && (
        <section className="panel event-create-panel">
          <h2>Schedule a Game Night</h2>
          <form onSubmit={handleCreateEvent}>
            <div className="field">
              <label htmlFor="event-title">Event Title</label>
              <input
                id="event-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Saturday Tabletop Gathering"
              />
            </div>

            <div className="field">
              <label htmlFor="event-date">Date & Time</label>
              <input
                id="event-date"
                type="datetime-local"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="event-host">Host (Host&apos;s home games automatically eligible)</label>
              <select
                id="event-host"
                value={hostUserId}
                onChange={(e) => setHostUserId(e.target.value)}
              >
                <option value="">No specific host</option>
                {group?.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="event-location">Location / Venue</label>
              <input
                id="event-location"
                type="text"
                placeholder="e.g. Carlos's place, Board Game Cafe"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="event-desc">Notes / Description (Optional)</label>
              <input
                id="event-desc"
                type="text"
                placeholder="e.g. Bring snacks, starting promptly at 7pm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="event-headcount">Override Total Headcount (Optional)</label>
              <input
                id="event-headcount"
                type="number"
                min={1}
                placeholder="Leave blank to calculate from RSVPs"
                value={manualHeadcount}
                onChange={(e) => setManualHeadcount(e.target.value)}
              />
            </div>

            <div className="panel-actions">
              <button type="submit" className="button" disabled={saving}>
                {saving ? "Scheduling…" : "Save Event"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filter Tabs */}
      {events.length > 0 && (
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
            className={`filter-chip ${filter === "upcoming" ? "filter-chip-active" : ""}`}
            onClick={() => setFilter("upcoming")}
          >
            📅 Upcoming ({events.filter((e) => e.status !== "COMPLETED").length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === "completed" ? "filter-chip-active" : ""}`}
            onClick={() => setFilter("completed")}
          >
            🏁 Past & Completed ({events.filter((e) => e.status === "COMPLETED").length})
          </button>
        </div>
      )}

      {/* Events List */}
      <div className="events-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <img src="/brand/tablefolk-mark.png" alt="" />
            <div>
              <h2>No game nights scheduled yet.</h2>
              <p>Schedule the first event so members can RSVP and draw games from who is attending!</p>
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <p className="empty">No events match the selected filter.</p>
        ) : filter === "all" ? (
          (() => {
            const upcoming = filteredEvents.filter((e) => e.status !== "COMPLETED");
            const completed = filteredEvents.filter((e) => e.status === "COMPLETED");

            return (
              <>
                {upcoming.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>📅 Upcoming Game Nights</span>
                      <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 400 }}>({upcoming.length})</span>
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {upcoming.map(renderEventCard)}
                    </div>
                  </div>
                )}

                {completed.length > 0 && (
                  <div style={{ marginTop: upcoming.length > 0 ? "32px" : 0 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px", color: "#166534" }}>
                      <span>🏁 Past & Completed Sessions</span>
                      <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 400 }}>({completed.length})</span>
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {completed.map(renderEventCard)}
                    </div>
                  </div>
                )}
              </>
            );
          })()
        ) : (
          filteredEvents.map(renderEventCard)
        )}
      </div>

      {managingGuestsEvent && (
        <GuestRsvpModal
          isOpen={Boolean(managingGuestsEvent)}
          onClose={() => setManagingGuestsEvent(null)}
          eventTitle={managingGuestsEvent.title}
          initialGuestNames={
            managingGuestsEvent.rsvps.find((r) => r.userId === user?.id)?.guestNames ?? []
          }
          onSave={async (names) => {
            await handleRsvp(managingGuestsEvent.id, "ATTENDING", names);
          }}
        />
      )}
    </div>
  );
}
