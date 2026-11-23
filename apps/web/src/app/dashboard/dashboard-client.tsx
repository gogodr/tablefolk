"use client";

import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useGroupsQuery,
  useCollectionQuery,
  useEventsCalendarQuery,
  useBggProfileQuery,
} from "@/lib/queries";
import { gameCoverSrc } from "@/lib/assets";
import "./dashboard.css";

export function DashboardClient() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
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
        <p className="loading">{t("loading")}</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>{t("unauthTitle")}</h1>
        <p>{t("unauthText")}</p>
        <Link href="/sign-in" className="button">{tCommon("signIn")}</Link>
      </section>
    );
  }

  const firstName = user?.firstName || user?.fullName || t("defaultPlayer");
  const hasContent = groups.length > 0 || games.length > 0;

  return (
    <div className="page dashboard-page">
      {/* Functional Header */}
      <header className="dashboard-header">
        <div className="dashboard-greeting">
          <h1>{t("greeting", { name: firstName })}</h1>
          <p>
            {nextEvent ? (
              <>
                <span aria-hidden="true">🎲</span>
                {t("nextEventPrefix")}<strong>{nextEvent.title}</strong> (
                {new Date(nextEvent.scheduledDate).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                )
              </>
            ) : (
              t("readyToPlay")
            )}
          </p>
        </div>
        <div className="dashboard-actions">
          <Link href="/events" className="button">
            {t("viewCalendar")}
          </Link>
          <Link href="/collection" className="button-secondary">
            {t("addGames")}
          </Link>
          <Link href="/groups" className="button-quiet">
            {t("viewGroups")}
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
                  {t("nextGameNight")}
                </span>
                <span className="hero-event-group-link">
                  {t("groupPrefix", {
                    name: nextEvent.groupName || groups.find((g) => g.id === nextEvent.groupId)?.name || t("groupLabel"),
                  })}
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
                      {t("hostPrefix", { name: nextEvent.hostDisplayName })}
                    </span>
                  )}
                </div>
              </div>

              {/* Official Pick (if selected) */}
              {nextEvent.officialPick && (
                <div className="hero-event-pick">
                  {nextEvent.officialPick.coverUrl ? (
                    <img
                      src={gameCoverSrc(nextEvent.officialPick.coverUrl)}
                      alt=""
                      className="hero-event-pick-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="hero-event-pick-cover" />
                  )}
                  <div className="hero-event-pick-details">
                    <span>{t("chosenGame")}</span>
                    <strong>{nextEvent.officialPick.name}</strong>
                    <span>
                      {t("gameDetails", {
                        min: nextEvent.officialPick.minPlayers ?? "?",
                        max: nextEvent.officialPick.maxPlayers ?? "?",
                        time: nextEvent.officialPick.playingTime ?? "?",
                      })}
                    </span>
                  </div>
                </div>
              )}

              {/* Attendees summary */}
              <div className="hero-event-attendees">
                <strong>{t("confirmed")}</strong>{" "}
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
                  <span>{t("noConfirmedYet")}</span>
                )}
              </div>

              <div className="hero-event-footer">
                <Link
                  href={`/groups/${nextEvent.groupId}/events/${nextEvent.id}`}
                  className="button"
                >
                  {t("enterEventRoom")}
                </Link>
                <Link
                  href={`/groups/${nextEvent.groupId}`}
                  className="text-link"
                >
                  {t("goToGroup")}
                </Link>
              </div>
            </article>
          ) : (
            <div className="dashboard-card dashboard-empty-card">
              <span className="dashboard-empty-icon" aria-hidden="true">
                🎲
              </span>
              <h3>{t("noEventsTitle")}</h3>
              <p>{t("noEventsSubtitle")}</p>
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <Link href="/groups" className="button">
                  {t("viewYourGroups")}
                </Link>
                <Link href="/events" className="button-secondary">
                  {t("viewEventsCalendar")}
                </Link>
              </div>
            </div>
          )}

          {/* Quick Game Draw Box */}
          {groups.length > 0 && (
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h2 className="dashboard-card-title">
                  <span>🎯</span> {t("quickDrawTitle")}
                </h2>
                <span className="dashboard-card-badge">Game Night</span>
              </div>
              <div className="quick-draw-box">
                <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "var(--text-sm)" }}>
                  {t("quickDrawSubtitle")}
                </p>
                <div className="quick-draw-controls">
                  <div className="quick-draw-field">
                    <label htmlFor="dashboard-group-select">{t("groupLabel")}</label>
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
                    <label htmlFor="dashboard-players-select">{t("playersLabel")}</label>
                    <select
                      id="dashboard-players-select"
                      className="quick-draw-select"
                      value={playerCount}
                      onChange={(e) => setPlayerCount(e.target.value)}
                    >
                      <option value="2">{t("playersCount", { count: 2 })}</option>
                      <option value="3">{t("playersCount", { count: 3 })}</option>
                      <option value="4">{t("playersCount", { count: 4 })}</option>
                      <option value="5">{t("playersCount", { count: 5 })}</option>
                      <option value="6">{t("playersSixPlus")}</option>
                    </select>
                  </div>
                  {effectiveGroupId && (
                    <Link
                      href={`/groups/${effectiveGroupId}/game-night`}
                      className="button"
                      style={{ height: "42px", display: "inline-flex", alignItems: "center" }}
                    >
                      {t("openGameNight")}
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
                  <span>🚀</span> {t("onboardingTitle")}
                </h2>
                <span className="dashboard-card-badge dashboard-card-badge-accent">
                  {t("onboardingBadge")}
                </span>
              </div>
              <div className="onboarding-steps">
                <Link href="/collection" className="onboarding-step">
                  <span className="onboarding-step-icon">📦</span>
                  <div className="onboarding-step-text">
                    <strong>{t("step1Title")}</strong>
                    <span>{t("step1Desc")}</span>
                  </div>
                </Link>
                <Link href="/groups" className="onboarding-step">
                  <span className="onboarding-step-icon">👥</span>
                  <div className="onboarding-step-text">
                    <strong>{t("step2Title")}</strong>
                    <span>{t("step2Desc")}</span>
                  </div>
                </Link>
                <Link href="/events" className="onboarding-step">
                  <span className="onboarding-step-icon">🗓️</span>
                  <div className="onboarding-step-text">
                    <strong>{t("step3Title")}</strong>
                    <span>{t("step3Desc")}</span>
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
                <span>👥</span> {t("yourGroups")}
              </h2>
              <Link href="/groups" className="text-link" style={{ fontSize: "var(--text-xs)" }}>
                {t("viewAllGroups", { count: groups.length })}
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
                        {t("memberCount", { count: g.memberCount })}
                      </span>
                    </div>
                    <div className="dashboard-group-actions">
                      <span className="button-quiet button-small">{t("viewArrow")}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "var(--space-md) 0" }}>
                <p style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-sm)" }}>
                  {t("noGroups")}
                </p>
                <Link href="/groups" className="button button-small">
                  {t("createOrJoinGroup")}
                </Link>
              </div>
            )}
          </div>

          {/* Collection Snapshot Widget */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">
                <span>📦</span> {t("yourCollection")}
              </h2>
              <Link href="/collection" className="text-link" style={{ fontSize: "var(--text-xs)" }}>
                {t("manage")}
              </Link>
            </div>
            <div className="dashboard-stats-grid">
              <div className="dashboard-stat-tile">
                <span className="dashboard-stat-value">{games.length}</span>
                <span className="dashboard-stat-label">{t("gamesInCollection")}</span>
              </div>
              <div className="dashboard-stat-tile">
                <span className="dashboard-stat-value">{sharedGamesCount}</span>
                <span className="dashboard-stat-label">{t("gamesShared")}</span>
              </div>
            </div>

            {/* BGG Status */}
            {bggData?.bggUsername ? (
              <div className="dashboard-bgg-sync">
                <span>
                  <span className="dashboard-bgg-dot" aria-hidden="true">●</span>
                  {t("bggPrefix")}<strong>@{bggData.bggUsername}</strong>
                </span>
                <Link href="/collection" className="button-quiet button-small" style={{ minHeight: "auto", padding: "2px 6px" }}>
                  {t("syncBgg")}
                </Link>
              </div>
            ) : (
              <div style={{ textAlign: "center", marginTop: "var(--space-xs)" }}>
                <Link href="/collection" className="button-secondary button-small" style={{ width: "100%", justifyContent: "center" }}>
                  {t("connectBgg")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
