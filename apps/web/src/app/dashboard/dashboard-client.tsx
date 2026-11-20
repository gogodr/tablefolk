"use client";

import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import {
  useGroupsQuery,
  useCollectionQuery,
  useEventsCalendarQuery,
  useBggProfileQuery,
} from "@/lib/queries";
import "./dashboard.css";

export function DashboardClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const { data: groupsData, isLoading: groupsLoading } = useGroupsQuery();
  const { data: collectionData, isLoading: collectionLoading } = useCollectionQuery();
  const { data: eventsData, isLoading: eventsLoading } = useEventsCalendarQuery();
  const { data: bggData } = useBggProfileQuery();

  const groups = groupsData?.groups ?? [];
  const games = collectionData?.games ?? [];
  const events = eventsData?.events ?? [];

  // Quick Draw local state
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [playerCount, setPlayerCount] = useState<string>("4");

  const effectiveGroupId = selectedGroupId || (groups[0]?.id ?? "");

  // Upcoming events
  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => new Date(e.scheduledDate).getTime() >= now - 4 * 60 * 60 * 1000) // Keep events active until 4h after start
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }, [events]);

  const nextEvent = upcomingEvents[0];

  // Collection stats
  const sharedGamesCount = useMemo(() => {
    return games.filter((g) => g.sharedGroupIds && g.sharedGroupIds.length > 0).length;
  }, [games]);

  const isLoading = !isLoaded || (isSignedIn && (groupsLoading || collectionLoading || eventsLoading));

  if (isLoading) {
    return (
      <div className="page dashboard-page">
        <p className="loading">Cargando tu mesa de juegos…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>Tu mesa de juegos empieza aquí.</h1>
        <p>Inicia sesión para ver tus grupos, eventos y tu colección.</p>
        <Link href="/sign-in" className="button">Iniciar sesión</Link>
      </section>
    );
  }

  const firstName = user?.firstName || user?.fullName || "jugador";
  const hasContent = groups.length > 0 || games.length > 0;

  return (
    <div className="page dashboard-page">
      {/* Functional Header */}
      <header className="dashboard-header">
        <div className="dashboard-greeting">
          <h1>¡Hola, {firstName}!</h1>
          <p>
            {nextEvent ? (
              <>
                <span aria-hidden="true">🎲</span>
                Próxima partida: <strong>{nextEvent.title}</strong> (
                {new Date(nextEvent.scheduledDate).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                )
              </>
            ) : (
              "Todo listo para organizar tu próxima noche de juegos."
            )}
          </p>
        </div>
        <div className="dashboard-actions">
          <Link href="/events" className="button">
            📅 Ver calendario
          </Link>
          <Link href="/collection" className="button-secondary">
            + Añadir juegos
          </Link>
          <Link href="/groups" className="button-quiet">
            Ver grupos
          </Link>
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-layout">
        {/* Left Column (Main Focus) */}
        <div className="dashboard-column">
          {/* Action Hero: Next Game Night */}
          {nextEvent ? (
            <article className="dashboard-card dashboard-hero-event">
              <div className="dashboard-card-header">
                <span className="dashboard-card-badge dashboard-card-badge-accent">
                  Próxima Game Night
                </span>
                <span className="hero-event-group-link">
                  Grupo: {nextEvent.groupName || groups.find((g) => g.id === nextEvent.groupId)?.name || "Grupo"}
                </span>
              </div>

              <div className="hero-event-highlight">
                <div className="hero-event-title">{nextEvent.title}</div>
                <div className="hero-event-meta">
                  <span className="hero-event-meta-item">
                    🗓️{" "}
                    {new Date(nextEvent.scheduledDate).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {nextEvent.location && (
                    <span className="hero-event-meta-item">
                      📍 {nextEvent.location}
                    </span>
                  )}
                  {nextEvent.hostDisplayName && (
                    <span className="hero-event-meta-item">
                      🏠 Anfitrión: {nextEvent.hostDisplayName}
                    </span>
                  )}
                </div>
              </div>

              {/* Official Pick (if selected) */}
              {nextEvent.officialPick && (
                <div className="hero-event-pick">
                  {nextEvent.officialPick.coverUrl ? (
                    <img
                      src={nextEvent.officialPick.coverUrl}
                      alt=""
                      className="hero-event-pick-cover"
                    />
                  ) : (
                    <div className="hero-event-pick-cover" />
                  )}
                  <div className="hero-event-pick-details">
                    <span>Juego elegido:</span>
                    <strong>{nextEvent.officialPick.name}</strong>
                    <span>
                      {nextEvent.officialPick.minPlayers}-
                      {nextEvent.officialPick.maxPlayers} jugadores ·{" "}
                      {nextEvent.officialPick.playingTime} min
                    </span>
                  </div>
                </div>
              )}

              {/* Attendees summary */}
              <div className="hero-event-attendees">
                <strong>Confirmados:</strong>{" "}
                {nextEvent.rsvps.filter((r) => r.status === "ATTENDING").length > 0 ? (
                  nextEvent.rsvps
                    .filter((r) => r.status === "ATTENDING")
                    .map((r, i) => (
                      <span key={r.userId}>
                        {i > 0 && ", "}
                        {r.displayName}
                        {r.additionalGuests > 0 && ` (+${r.additionalGuests})`}
                      </span>
                    ))
                ) : (
                  <span>Aún nadie ha confirmado asistencia</span>
                )}
              </div>

              <div className="hero-event-footer">
                <Link
                  href={`/groups/${nextEvent.groupId}/events/${nextEvent.id}`}
                  className="button"
                >
                  Entrar a la sala del evento →
                </Link>
                <Link
                  href={`/groups/${nextEvent.groupId}`}
                  className="text-link"
                >
                  Ir al grupo
                </Link>
              </div>
            </article>
          ) : (
            <div className="dashboard-card dashboard-empty-card">
              <span className="dashboard-empty-icon" aria-hidden="true">
                🎲
              </span>
              <h3>No tienes partidas agendadas</h3>
              <p>
                Reúne a tu mesa, propón una fecha y deja que Tablefolk elija el
                juego perfecto para la cantidad de jugadores.
              </p>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <Link href="/groups" className="button">
                  Ver tus grupos
                </Link>
                <Link href="/events" className="button-secondary">
                  Ver calendario de eventos
                </Link>
              </div>
            </div>
          )}

          {/* Quick Game Draw Box */}
          {groups.length > 0 && (
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h2 className="dashboard-card-title">
                  <span>🎯</span> Selector rápido de juegos (Quick Draw)
                </h2>
                <span className="dashboard-card-badge">Game Night</span>
              </div>
              <div className="quick-draw-box">
                <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--text-sm)" }}>
                  Filtra al instante los juegos que tus amigos han compartido para encontrar el título ideal para hoy.
                </p>
                <div className="quick-draw-controls">
                  <div className="quick-draw-field">
                    <label htmlFor="dashboard-group-select">Grupo</label>
                    <select
                      id="dashboard-group-select"
                      className="quick-draw-select"
                      value={effectiveGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="quick-draw-field" style={{ maxWidth: "130px" }}>
                    <label htmlFor="dashboard-players-select">Jugadores</label>
                    <select
                      id="dashboard-players-select"
                      className="quick-draw-select"
                      value={playerCount}
                      onChange={(e) => setPlayerCount(e.target.value)}
                    >
                      <option value="2">2 jugadores</option>
                      <option value="3">3 jugadores</option>
                      <option value="4">4 jugadores</option>
                      <option value="5">5 jugadores</option>
                      <option value="6">6+ jugadores</option>
                    </select>
                  </div>
                  {effectiveGroupId && (
                    <Link
                      href={`/groups/${effectiveGroupId}/game-night`}
                      className="button"
                      style={{ height: "42px", display: "inline-flex", alignItems: "center" }}
                    >
                      🎲 Abrir Game Night →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Onboarding Guide (when no content yet) */}
          {!hasContent && (
            <div className="dashboard-card onboarding-card">
              <div className="dashboard-card-header">
                <h2 className="dashboard-card-title">
                  <span>🚀</span> Primeros pasos en Tablefolk
                </h2>
                <span className="dashboard-card-badge dashboard-card-badge-accent">
                  Guía de inicio
                </span>
              </div>
              <div className="onboarding-steps">
                <Link href="/collection" className="onboarding-step">
                  <span className="onboarding-step-icon">📦</span>
                  <div className="onboarding-step-text">
                    <strong>1. Agrega o importa tus juegos</strong>
                    <span>
                      Sincroniza tu cuenta de BoardGameGeek o busca tus juegos favoritos uno a uno.
                    </span>
                  </div>
                </Link>
                <Link href="/groups" className="onboarding-step">
                  <span className="onboarding-step-icon">👥</span>
                  <div className="onboarding-step-text">
                    <strong>2. Crea tu primer grupo de juego</strong>
                    <span>
                      Invita a tus amigos por correo o comparte un enlace directo para unir sus colecciones.
                    </span>
                  </div>
                </Link>
                <Link href="/events" className="onboarding-step">
                  <span className="onboarding-step-icon">🗓️</span>
                  <div className="onboarding-step-text">
                    <strong>3. Programa tu primera noche de juegos</strong>
                    <span>
                      Establece una fecha, confirma quiénes van y sortea qué juego llega a la mesa.
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (Groups & Collection Overview) */}
        <div className="dashboard-column">
          {/* Active Groups Widget */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">
                <span>👥</span> Tus Grupos
              </h2>
              <Link href="/groups" className="text-link" style={{ fontSize: "var(--text-xs)" }}>
                Ver todos ({groups.length})
              </Link>
            </div>
            {groups.length > 0 ? (
              <div className="dashboard-groups-list">
                {groups.slice(0, 4).map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/${g.id}`}
                    className="dashboard-group-item"
                  >
                    <div className="dashboard-group-info">
                      <strong>{g.name}</strong>
                      <span>
                        {g.memberCount} {g.memberCount === 1 ? "miembro" : "miembros"}
                      </span>
                    </div>
                    <div className="dashboard-group-actions">
                      <span className="button-quiet button-small">Ver →</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "var(--space-md) 0" }}>
                <p style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-sm)" }}>
                  Aún no formas parte de ningún grupo.
                </p>
                <Link href="/groups" className="button button-small">
                  + Crear o unirse a un grupo
                </Link>
              </div>
            )}
          </div>

          {/* Collection Snapshot Widget */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">
                <span>📦</span> Tu Colección
              </h2>
              <Link href="/collection" className="text-link" style={{ fontSize: "var(--text-xs)" }}>
                Gestionar
              </Link>
            </div>
            <div className="dashboard-stats-grid">
              <div className="dashboard-stat-tile">
                <span className="dashboard-stat-value">{games.length}</span>
                <span className="dashboard-stat-label">Juegos en colección</span>
              </div>
              <div className="dashboard-stat-tile">
                <span className="dashboard-stat-value">{sharedGamesCount}</span>
                <span className="dashboard-stat-label">Compartidos con grupos</span>
              </div>
            </div>

            {/* BGG Status */}
            {bggData?.bggUsername ? (
              <div className="dashboard-bgg-sync">
                <span>
                  <span className="dashboard-bgg-dot" aria-hidden="true">●</span>
                  BGG: <strong>@{bggData.bggUsername}</strong>
                </span>
                <Link href="/collection" className="button-quiet button-small" style={{ minHeight: "auto", padding: "2px 6px" }}>
                  Sincronizar
                </Link>
              </div>
            ) : (
              <div style={{ textAlign: "center", marginTop: "var(--space-xs)" }}>
                <Link href="/collection" className="button-secondary button-small" style={{ width: "100%", justifyContent: "center" }}>
                  Conectar con BoardGameGeek
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
