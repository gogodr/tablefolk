"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import type {
  EventDetail,
  EventMenuOption,
  EventMenuPoll,
  Game,
  GroupDetail,
  GroupGame,
  Member,
  PickResult,
  SessionLineupResult,
  SessionMenuTrioResult,
} from "@tablefolk/contracts";
import { GameCard, cleanExpansionName, weightLabel, playerRange } from "@/components/game-card";
import { GameDetailModal } from "@/components/game-detail-modal";
import { GuestRsvpModal } from "@/components/guest-rsvp-modal";
import { gameCoverSrc } from "@/lib/assets";
import { useApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useEventDetailQuery, useGroupGamesQuery, useGroupDetailQuery } from "@/lib/queries";

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type Mode = "lineup" | "single";

export function EventClient() {
  const tEvents = useTranslations("events");
  const tCard = useTranslations("gameCard");
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const api = useApi();
  const queryClient = useQueryClient();
  const eventQuery = useEventDetailQuery(eventId);
  const gamesQuery = useGroupGamesQuery(groupId);
  const groupQuery = useGroupDetailQuery(groupId);

  const [event, setEvent] = useState<EventDetail | null>(() => eventQuery.data?.event ?? null);
  const [managingGuestAttendee, setManagingGuestAttendee] = useState<{ userId: string; displayName: string; guestNames: string[] } | null>(null);
  const [rsvping, setRsvping] = useState(false);
  const [loading, setLoading] = useState(() => !eventQuery.data?.event);
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
  const [themeCategory, setThemeCategory] = useState<string>("");
  const [lineupResult, setLineupResult] = useState<SessionLineupResult | null>(null);

  // 3-Menu Trio & Poll controls
  const [trioResult, setTrioResult] = useState<SessionMenuTrioResult | null>(null);
  const [planningTrio, setPlanningTrio] = useState(false);
  const [voting, setVoting] = useState(false);

  // Close Event Modal & Actual Played Games & Attendance
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingEvent, setClosingEvent] = useState(false);
  const [groupGamesList, setGroupGamesList] = useState<GroupGame[]>([]);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  const [playedGameIds, setPlayedGameIds] = useState<number[]>([]);
  const [attendedUserIds, setAttendedUserIds] = useState<string[]>([]);
  const [attendedGuestNames, setAttendedGuestNames] = useState<string[]>([]);
  const [walkInGuestInput, setWalkInGuestInput] = useState("");
  const [showOtherGames, setShowOtherGames] = useState(false);
  const [otherGameSearch, setOtherGameSearch] = useState("");
  const [otherGameSource, setOtherGameSource] = useState<"group" | "bgg">("group");
  const [bggQuery, setBggQuery] = useState("");
  const [bggResults, setBggResults] = useState<{ bggId: number; name: string; yearPublished: number | null; kind: "boardgame" | "boardgameexpansion" }[]>([]);
  const [bggSearching, setBggSearching] = useState(false);
  const [bggError, setBggError] = useState("");
  const [customGameNames, setCustomGameNames] = useState<Record<number, string>>({});
  const [selectedModalGame, setSelectedModalGame] = useState<Game | null>(null);
  const closeDialogRef = useRef<HTMLDialogElement>(null);

  // Edit Event Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editHostUserId, setEditHostUserId] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editManualHeadcount, setEditManualHeadcount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const filteredOtherGames = useMemo(() => {
    const q = otherGameSearch.trim().toLowerCase();
    if (!q) return groupGamesList;
    return groupGamesList.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupGamesList, otherGameSearch]);

  const gameNameMap = useMemo(() => {
    const map = new Map<number, string>();
    groupGamesList.forEach((g) => map.set(g.bggId, g.name));
    if (event?.officialPick) map.set(event.officialPick.bggId, event.officialPick.name);
    event?.officialLineup?.forEach((s) => map.set(s.bggId, s.name));
    event?.playedGames?.forEach((g) => map.set(g.bggId, g.name));
    Object.entries(customGameNames).forEach(([id, name]) => map.set(Number(id), name));
    return map;
  }, [groupGamesList, event, customGameNames]);

  useEffect(() => {
    if (otherGameSource !== "bgg" || bggQuery.trim().length < 2) {
      setBggResults([]);
      setBggSearching(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBggSearching(true);
      setBggError("");
      try {
        const data = await api<{ games: { bggId: number; name: string; yearPublished: number | null; kind: "boardgame" | "boardgameexpansion" }[] }>(
          `/v1/catalog/search?q=${encodeURIComponent(bggQuery.trim())}`
        );
        if (!cancelled) {
          const seen = new Set<number>();
          setBggResults(
            data.games.filter((g) => {
              if (seen.has(g.bggId)) return false;
              seen.add(g.bggId);
              return true;
            })
          );
        }
      } catch (err) {
        if (!cancelled) {
          setBggResults([]);
          setBggError(err instanceof Error ? err.message : "Could not search BoardGameGeek.");
        }
      } finally {
        if (!cancelled) setBggSearching(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, bggQuery, otherGameSource]);

  function handleAddBggGame(game: { bggId: number; name: string; yearPublished: number | null }) {
    const label = game.yearPublished ? `${game.name} (${game.yearPublished})` : game.name;
    setCustomGameNames((prev) => ({ ...prev, [game.bggId]: label }));
    if (!playedGameIds.includes(game.bggId)) {
      setPlayedGameIds((prev) => [...prev, game.bggId]);
    }
  }

  function handleMovePlayedGame(index: number, direction: "up" | "down") {
    setPlayedGameIds((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const current = copy[index];
      const target = copy[targetIndex];
      if (current === undefined || target === undefined) return prev;
      copy[index] = target;
      copy[targetIndex] = current;
      return copy;
    });
  }

  function handleRemovePlayedGame(bggId: number) {
    setPlayedGameIds((prev) => prev.filter((id) => id !== bggId));
  }

  const availableCategories = useMemo(() => {
    return Array.from(
      new Set(groupGamesList.flatMap((g) => (g.categories ?? []).map(decodeHtmlEntities)))
    ).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [groupGamesList]);

  useEffect(() => {
    if (eventQuery.data?.event) {
      setEvent(eventQuery.data.event);
      setPlayerCount((prev) => prev || eventQuery.data.event.totalHeadcount || 4);
      setLoading(false);
    }
  }, [eventQuery.data?.event]);

  useEffect(() => {
    if (gamesQuery.data?.games) {
      setGroupGamesList(gamesQuery.data.games);
    }
  }, [gamesQuery.data?.games]);

  useEffect(() => {
    if (groupQuery.data?.group?.members) {
      setGroupMembers(groupQuery.data.group.members);
    }
  }, [groupQuery.data?.group?.members]);

  const load = useCallback(async () => {
    try {
      const [eventRes] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.eventDetail(eventId),
          queryFn: () => api<{ event: EventDetail }>(`/v1/events/${eventId}`),
        }),
        queryClient.ensureQueryData({
          queryKey: queryKeys.groupGames(groupId),
          queryFn: () => api<{ games: GroupGame[] }>(`/v1/groups/${groupId}/games`),
        }).catch(() => ({ games: [] })),
        queryClient.ensureQueryData({
          queryKey: queryKeys.groupDetail(groupId),
          queryFn: () => api<{ group: GroupDetail }>(`/v1/groups/${groupId}`),
        }).catch(() => ({ group: null })),
      ]);
      setEvent(eventRes.event);
      setPlayerCount((prev) => prev || eventRes.event.totalHeadcount || 4);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this event.");
    } finally {
      setLoading(false);
    }
  }, [api, eventId, groupId, queryClient]);

  useEffect(() => {
    if (isLoaded && isSignedIn && !eventQuery.data?.event) {
      void load();
    } else if (isLoaded && !isSignedIn) {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, load, eventQuery.data?.event]);

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
          themeCategory: themeCategory || undefined,
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
          themeCategory: themeCategory || undefined,
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
      queryClient.setQueryData(queryKeys.eventDetail(eventId), res);
      await queryClient.invalidateQueries({ queryKey: queryKeys.events });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
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
      queryClient.setQueryData(queryKeys.eventDetail(eventId), res);
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
      queryClient.setQueryData(queryKeys.eventDetail(eventId), res);
      await queryClient.invalidateQueries({ queryKey: queryKeys.events });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
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

    let message = `🎲 *Vote for the game night menu: ${event.title}!* 🗳️\n`;
    message += `📅 ${dateFormatted}\n`;
    if (event.location) message += `📍 ${event.location}\n`;
    message += `👥 ${event.totalHeadcount} confirmed attendees\n\n`;
    message += `*Choose your favorite lineup for tonight:*\n\n`;

    pollOptions.forEach((opt) => {
      message += `🔹 *${opt.title}* (${opt.styleBadge}) · ~${opt.totalEstimatedMinutes} min\n`;
      opt.lineup.forEach((slot) => {
        const expList = slot.expansions !== undefined ? slot.expansions : slot.game.expansions;
        const expStr = expList && expList.length > 0
          ? ` (+ ${expList.map((e) => cleanExpansionName(slot.game.name, e.name)).join(", ")})`
          : "";
        message += `  • ${slot.label}: *${slot.game.name}*${expStr} (~${slot.estimatedMinutes}m)\n`;
      });
      message += `  💬 ${opt.description}\n\n`;
    });

    if (typeof window !== "undefined") {
      message += `🔗 Vote directly on Tablefolk:\n${window.location.href}`;
      void navigator.clipboard.writeText(message);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 3000);
    }
  }

  async function handleOpenCloseEventModal() {
    const defaultIds: number[] = [];
    if (event?.playedBggIds && event.playedBggIds.length > 0) {
      defaultIds.push(...event.playedBggIds);
    } else if (event?.officialLineup && event.officialLineup.length > 0) {
      event.officialLineup.forEach((s) => defaultIds.push(s.bggId));
    } else if (event?.officialPickBggId) {
      defaultIds.push(event.officialPickBggId);
    }
    setPlayedGameIds(defaultIds);
    setOtherGameSearch("");
    setShowOtherGames(false);
    setOtherGameSource("group");
    setBggQuery("");
    setBggResults([]);
    setBggError("");

    // Initial attendees: everyone who currently RSVP'd ATTENDING
    const initialAttendees = (event?.rsvps ?? [])
      .filter((r) => r.status === "ATTENDING")
      .map((r) => r.userId);
    setAttendedUserIds(initialAttendees);

    const initialGuests = (event?.confirmedGuestNames && event.confirmedGuestNames.length > 0)
      ? event.confirmedGuestNames
      : (event?.rsvps ?? [])
          .filter((r) => r.status === "ATTENDING")
          .flatMap((r) => r.guestNames ?? []);
    setAttendedGuestNames(initialGuests);
    setWalkInGuestInput("");

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

  function handleToggleAttendee(userId: string) {
    setAttendedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function handleToggleGuest(name: string) {
    setAttendedGuestNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function handleAddWalkInGuest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = walkInGuestInput.trim();
    if (!trimmed) return;
    if (!attendedGuestNames.includes(trimmed)) {
      setAttendedGuestNames((prev) => [...prev, trimmed]);
    }
    setWalkInGuestInput("");
  }

  async function handleConfirmCloseEvent() {
    setClosingEvent(true);
    try {
      const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}/close`, {
        method: "POST",
        body: JSON.stringify({
          playedBggIds: playedGameIds,
          attendedUserIds,
          attendedGuestNames,
        }),
      });
      queryClient.setQueryData(queryKeys.eventDetail(eventId), res);
      await queryClient.invalidateQueries({ queryKey: queryKeys.events });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
      setEvent(res.event);
      setShowCloseModal(false);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not close event.");
    } finally {
      setClosingEvent(false);
    }
  }

  async function handleRsvp(status: "ATTENDING" | "MAYBE" | "DECLINED", guestNames: string[] = []) {
    if (!event || !user) return;
    setRsvping(true);
    try {
      await api(`/v1/events/${eventId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status, guestNames, additionalGuests: guestNames.length }),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.events });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
      await load();
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not update RSVP.");
    } finally {
      setRsvping(false);
    }
  }

  async function handleSaveAttendeeGuests(guestNames: string[]) {
    if (!managingGuestAttendee || !event) return;
    const targetUserId = managingGuestAttendee.userId;
    const currentRsvp = event.rsvps.find((r) => r.userId === targetUserId);
    const status = currentRsvp?.status ?? "ATTENDING";

    if (targetUserId === user?.id) {
      await handleRsvp(status, guestNames);
    } else {
      try {
        const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}/attendance`, {
          method: "PUT",
          body: JSON.stringify({
            rsvps: [{
              userId: targetUserId,
              status,
              guestNames,
              additionalGuests: guestNames.length,
            }],
          }),
        });
        queryClient.setQueryData(queryKeys.eventDetail(eventId), res);
        await queryClient.invalidateQueries({ queryKey: queryKeys.events });
        await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
        setEvent(res.event);
      } catch (cause) {
        alert(cause instanceof Error ? cause.message : "Could not update attendee guests.");
      }
    }
    setManagingGuestAttendee(null);
  }

  function handleOpenEditModal() {
    if (!event) return;
    setEditTitle(event.title);
    setEditScheduledDate(event.scheduledDate ? new Date(event.scheduledDate).toISOString().slice(0, 16) : "");
    setEditHostUserId(event.hostUserId ?? "");
    setEditLocation(event.location ?? "");
    setEditDescription(event.description ?? "");
    setEditManualHeadcount(
      event.manualHeadcount !== null && event.manualHeadcount !== undefined
        ? String(event.manualHeadcount)
        : ""
    );
    setShowEditModal(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim() || !editScheduledDate) return;
    setSavingEdit(true);
    try {
      const res = await api<{ event: EventDetail }>(`/v1/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          scheduledDate: new Date(editScheduledDate).toISOString(),
          hostUserId: editHostUserId || null,
          location: editLocation.trim() || null,
          description: editDescription.trim() || null,
          manualHeadcount: editManualHeadcount ? Number(editManualHeadcount) : null,
        }),
      });
      queryClient.setQueryData(queryKeys.eventDetail(eventId), res);
      await queryClient.invalidateQueries({ queryKey: queryKeys.events });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
      setEvent(res.event);
      setShowEditModal(false);
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : "Could not update event.");
    } finally {
      setSavingEdit(false);
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.eventDetail(eventId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.events });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupEvents(groupId) });
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
    message += `👥 ${event.totalHeadcount} confirmed attendees\n\n`;

    if (event.status === "COMPLETED") {
      message += `🏆 *¡Game Night Finalizada!*\n`;
      if (event.playedGames && event.playedGames.length > 0) {
        message += `🎲 *Juegos que vieron mesa:*\n`;
        event.playedGames.forEach((g, i) => {
          const weightStr = g.weight ? ` (Peso: ${g.weight.toFixed(1)})` : "";
          const timeStr = g.playingTime ? ` [~${g.playingTime}m]` : "";
          message += `${i + 1}️⃣ *${g.name}*${timeStr}${weightStr}\n`;
        });
        message += `\n`;
      }
    } else if (event.officialPick) {
      message += `✨ *Official Game of the Night:*\n`;
      message += `👉 *${event.officialPick.name}*`;
      if (event.officialPickCarrier) message += ` (Brought by: ${event.officialPickCarrier})`;
      message += `\n📺 How to play: https://www.youtube.com/results?search_query=how+to+play+${encodeURIComponent(event.officialPick.name)}+board+game\n\n`;
    } else if (event.officialLineup && event.officialLineup.length > 0) {
      message += `✨ *Scheduled Session Menu:*\n`;
      event.officialLineup.forEach((slot, i) => {
        const expStr = slot.expansions && slot.expansions.length > 0
          ? ` (+ ${slot.expansions.map((e) => cleanExpansionName(slot.name, e.name)).join(", ")})`
          : "";
        message += `${i + 1}️⃣ *${slot.name}*${expStr} (${slot.label} · ~${slot.estimatedMinutes}m)`;
        if (slot.carrierDisplayName) message += ` [Brought by: ${slot.carrierDisplayName}]`;
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

  const canManage = event?.canManage ?? (!event?.hostUserId || event?.hostUserId === user?.id);
  const isHostOrCreator = canManage;
  const myRsvp = event?.rsvps.find((r) => r.userId === user?.id);
  const hasOfficialSelection = Boolean(
    event?.officialPick || (event?.officialLineup && event.officialLineup.length > 0)
  );
  const isCompleted = event?.status === "COMPLETED";

  if (!isLoaded || loading) return <div className="page"><p className="loading">{tEvents("enteringGameNight")}</p></div>;
  if (!isSignedIn) {
    return (
      <section className="narrow-page notice-page">
        <h1>{tEvents("signInToJoin")}</h1>
        <Link href="/sign-in" className="button">Sign in</Link>
      </section>
    );
  }

  if (error && !event) {
    return (
      <section className="narrow-page">
        <div className="state-message error" role="alert">
          <p>{error || "Event not found."}</p>
          <Link href={`/groups/${groupId}/events`} className="button-secondary">{tEvents("backToEvents")}</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="page">
      <Link href={`/groups/${groupId}/events`} className="back-link">{tEvents("backToEvents")}</Link>

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
            <strong>{event?.totalHeadcount}</strong> {tEvents("headcountConfirmed", { count: event?.totalHeadcount ?? 0 })}
          </p>

          {/* Attendees preview pill list */}
          {event && event.rsvps.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", margin: "8px 0 16px", fontSize: "13px" }}>
              <span style={{ fontWeight: 600, color: "var(--muted)" }}>{tEvents("theTableCrew", { count: event.rsvps.filter((r) => r.status === "ATTENDING").length })}:</span>
              {event.rsvps.filter((r) => r.status === "ATTENDING").map((r) => (
                <span
                  key={r.userId}
                  style={{
                    background: "var(--color-paper, #f9fafb)",
                    border: "1px solid var(--border)",
                    borderRadius: "14px",
                    padding: "2px 8px",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <strong>{r.displayName}</strong>
                  {r.guestNames && r.guestNames.length > 0 ? (
                    <span style={{ color: "var(--muted)" }}> (+ {r.guestNames.join(", ")})</span>
                  ) : r.additionalGuests > 0 ? (
                    <span style={{ color: "var(--muted)" }}> (+{r.additionalGuests})</span>
                  ) : null}
                  {(canManage || r.userId === user?.id) && (
                    <button
                      type="button"
                      className="button-quiet button-small"
                      style={{ padding: "0 2px", fontSize: "11px", marginLeft: "2px", lineHeight: 1 }}
                      title={tEvents("manageGuestsOf", { name: r.displayName })}
                      onClick={() => setManagingGuestAttendee({ userId: r.userId, displayName: r.displayName, guestNames: r.guestNames ?? [] })}
                    >
                      ✏️
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* RSVP & Guest Control for current user */}
          {event && event.status === "SCHEDULED" && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", margin: "10px 0 16px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)" }}>
                {tEvents("rsvpTitle")}
              </span>
              <button
                type="button"
                className={`button-small ${myRsvp?.status === "ATTENDING" ? "button-primary" : "button-secondary"}`}
                disabled={rsvping}
                onClick={() => void handleRsvp("ATTENDING", myRsvp?.guestNames ?? [])}
              >
                {tEvents("attending")}
              </button>
              <button
                type="button"
                className={`button-small ${myRsvp?.status === "MAYBE" ? "button-primary" : "button-secondary"}`}
                disabled={rsvping}
                onClick={() => void handleRsvp("MAYBE", myRsvp?.guestNames ?? [])}
              >
                {tEvents("maybe")}
              </button>
              <button
                type="button"
                className={`button-small ${myRsvp?.status === "DECLINED" ? "button-danger" : "button-secondary"}`}
                disabled={rsvping}
                onClick={() => void handleRsvp("DECLINED", [])}
              >
                {tEvents("declined")}
              </button>
              {myRsvp?.status === "ATTENDING" && user && (
                <button
                  type="button"
                  className="button-quiet button-small"
                  onClick={() => setManagingGuestAttendee({ userId: user.id, displayName: user.fullName || user.username || "You", guestNames: myRsvp.guestNames ?? [] })}
                  style={{ border: "1px dashed var(--border)", borderRadius: "6px" }}
                >
                  👥 {myRsvp.guestNames && myRsvp.guestNames.length > 0
                    ? `+${myRsvp.guestNames.length} (${myRsvp.guestNames.join(", ")})`
                    : tEvents("manageMyGuests")}
                </button>
              )}
            </div>
          )}

          {/* Event Quick Actions Bar: Share WhatsApp & Calendar */}
          <div className="event-quick-actions">
            {canManage && event?.status === "SCHEDULED" && (
              <button
                type="button"
                className="button-small"
                style={{ background: "#15803d", color: "#fff", borderColor: "#166534" }}
                onClick={() => void handleOpenCloseEventModal()}
              >
                {tEvents("finishAndRecord")}
              </button>
            )}
            {canManage && event?.status === "COMPLETED" && (
              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => void handleOpenCloseEventModal()}
              >
                {tEvents("editPlayedGamesAndAttendance")}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="button-secondary button-small"
                onClick={handleOpenEditModal}
              >
                {tEvents("editEventDetails")}
              </button>
            )}
            <button
              type="button"
              className={isCompleted ? "button button-small" : "button-secondary button-small"}
              onClick={handleCopyShareText}
            >
              {copiedShare ? "✓ Copied to Clipboard!" : "📋 Copy WhatsApp / Discord Summary"}
            </button>
            {!isCompleted && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Mode Switcher - only show if planning is active */}
        {!isCompleted && !hasOfficialSelection && (
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
        )}
      </div>

      {/* Completed Event Status Banner with Graphical Session Timeline */}
      {event?.status === "COMPLETED" && (() => {
        const playedGames = event.playedGames ?? [];
        const attendeesList = [
          ...event.rsvps.filter((r) => r.status === "ATTENDING").map((r) => ({
            name: r.displayName,
            isHost: r.userId === event.hostUserId,
            isGuest: false,
          })),
          ...(event.confirmedGuestNames && event.confirmedGuestNames.length > 0
            ? event.confirmedGuestNames.map((name) => ({ name, isHost: false, isGuest: true }))
            : event.rsvps
                .filter((r) => r.status === "ATTENDING")
                .flatMap((r) => (r.guestNames ?? []).map((name) => ({ name, isHost: false, isGuest: true })))),
        ];

        const totalPlayingMinutes = playedGames.reduce((acc, g) => acc + (g.playingTime || 45), 0);
        const totalBufferMinutes = Math.max(0, playedGames.length - 1) * 15;
        const grandTotalMinutes = totalPlayingMinutes + totalBufferMinutes;

        const validWeights = playedGames.filter((g) => g.weight && g.weight > 0);
        const avgWeight = validWeights.length > 0
          ? (validWeights.reduce((acc, g) => acc + g.weight!, 0) / validWeights.length).toFixed(1)
          : null;

        return (
          <section className="completed-recap-wrap" aria-label="Game Night Recap">
            {/* Hero Banner */}
            <div className="completed-hero-banner">
              <div className="completed-hero-header">
                <div className="completed-hero-titles">
                  <span className="completed-pill-tag">
                    {tEvents("eventFinishedVerified")}
                  </span>
                  <h2>
                    {playedGames.length > 0
                      ? tEvents("gamesTabled", { count: playedGames.length })
                      : tEvents("gameNightCompleted")}
                  </h2>
                  <p>
                    {tEvents("playersGathered", { count: event.totalHeadcount })}
                    {event.location ? tEvents("atLocation", { location: event.location }) : ""}
                    {event.hostDisplayName ? tEvents("hostPrefix", { name: event.hostDisplayName }) : ""}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="button-secondary button-small"
                    onClick={() => void handleOpenCloseEventModal()}
                  >
                    {tEvents("editGamesAndAttendance")}
                  </button>
                )}
              </div>

              {/* Graphical Session Timeline Track */}
              {playedGames.length > 0 && (
                <div className="completed-timeline-track-card">
                  <div className="completed-timeline-track-header">
                    <span>{tEvents("sessionTimeline")}</span>
                    <span>{tEvents("totalMinutesEstimated", { minutes: grandTotalMinutes })}</span>
                  </div>

                  <div className="completed-timeline-bar" role="img" aria-label={tEvents("timelineAria")}>
                    {playedGames.map((g, idx) => {
                      const duration = g.playingTime || 45;
                      const flexGrow = Math.max(duration, 30);
                      const themeClass =
                        playedGames.length === 1
                          ? "theme-main"
                          : idx === 0
                          ? "theme-warm"
                          : idx === playedGames.length - 1
                          ? "theme-cool"
                          : "theme-main";

                      const roleLabel =
                        playedGames.length === 1
                          ? tEvents("gameOfTheNight")
                          : idx === 0
                          ? tEvents("warmUp")
                          : idx === playedGames.length - 1
                          ? tEvents("nightcap")
                          : tEvents("gameNumber", { number: idx + 1 });

                      return (
                        <div key={g.bggId} style={{ display: "contents" }}>
                          {idx > 0 && (
                            <div
                              className="timeline-segment-intermission"
                              title={tEvents("intermissionTitle")}
                            >
                              {tEvents("intermissionShort")}
                            </div>
                          )}
                          <a
                            href={`#game-card-${g.bggId}`}
                            className={`timeline-segment-game ${themeClass}`}
                            style={{ flex: `${flexGrow} 1 0%`, textDecoration: "none" }}
                            title={`${roleLabel}: ${g.name} (~${duration} min)`}
                          >
                            <span>#{idx + 1} · {duration}m</span>
                          </a>
                        </div>
                      );
                    })}
                  </div>

                  <div className="completed-timeline-ruler">
                    <span>{tEvents("timelineStart")}</span>
                    <span>{tEvents("timelineIntermissions")}</span>
                    <span>{tEvents("timelineEnd", { minutes: grandTotalMinutes })}</span>
                  </div>
                </div>
              )}

              {/* Stats Row */}
              <div className="completed-stats-row">
                <div className="completed-stat-tile">
                  <span className="completed-stat-number">{playedGames.length}</span>
                  <span className="completed-stat-label">{tEvents("gamesPlayedStat")}</span>
                </div>
                <div className="completed-stat-tile">
                  <span className="completed-stat-number">{event.totalHeadcount}</span>
                  <span className="completed-stat-label">{tEvents("playersAtTableStat")}</span>
                </div>
                <div className="completed-stat-tile">
                  <span className="completed-stat-number">~{grandTotalMinutes} min</span>
                  <span className="completed-stat-label">{tEvents("totalDurationStat")}</span>
                </div>
                <div className="completed-stat-tile">
                  <span className="completed-stat-number">{avgWeight ? `${avgWeight} / 5.0` : "—"}</span>
                  <span className="completed-stat-label">{tEvents("bggDifficultyStat")}</span>
                </div>
              </div>
            </div>

            {/* Vertical Timeline Flow with Game Cards */}
            {playedGames.length > 0 ? (
              <div className="completed-flow-list">
                {playedGames.map((g, idx) => {
                  const duration = g.playingTime || 45;
                  const roleLabel =
                    playedGames.length === 1
                      ? tEvents("gameOfTheNight")
                      : idx === 0
                      ? tEvents("warmUpRole")
                      : idx === playedGames.length - 1
                      ? tEvents("nightcapRole")
                      : tEvents("roundMainEvent", { number: idx + 1 });

                  const weightClass =
                    g.weight && g.weight <= 2.2
                      ? "light"
                      : g.weight && g.weight <= 3.5
                      ? "medium"
                      : g.weight
                      ? "heavy"
                      : "";

                  return (
                    <div key={g.bggId} id={`game-card-${g.bggId}`} className="completed-flow-item" style={{ scrollMarginTop: "24px" }}>
                      {idx > 0 && (
                        <div className="completed-intermission-step">
                          {tEvents("intermissionStep")}
                        </div>
                      )}
                      <div
                        className="completed-slot-card"
                        onClick={() => setSelectedModalGame(g)}
                        style={{ cursor: "pointer" }}
                        title={tEvents("clickForDetails")}
                      >
                        <div className="completed-slot-order">#{idx + 1}</div>
                        <div className="completed-slot-cover">
                          {g.coverUrl ? (
                            <img
                              src={gameCoverSrc(g.coverUrl)}
                              alt=""
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const fallback = e.currentTarget.parentElement?.querySelector(".fallback-dice");
                                if (fallback) (fallback as HTMLElement).style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="fallback-dice"
                            style={{
                              width: "100%",
                              height: "100%",
                              display: g.coverUrl ? "none" : "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "24px",
                            }}
                          >
                            🎲
                          </div>
                        </div>
                        <div className="completed-slot-info">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "6px" }}>
                            <h3>{g.name}</h3>
                            <span className="slot-role-badge" style={{ fontSize: "11px" }}>{roleLabel}</span>
                          </div>
                          <div className="completed-slot-meta">
                            <span>👥 {playerRange(g, (key, values) => tCard(key as any, values))}</span>
                            <span>⏱️ ~{duration} min</span>
                            {g.weight && (
                              <span className={`completed-weight-badge ${weightClass}`}>
                                {weightLabel(g.weight, (key, values) => tCard(key as any, values))}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span className="button-quiet button-small" style={{ fontSize: "12px" }}>
                            {tEvents("viewDetails")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="panel" style={{ textAlign: "center", padding: "24px", color: "var(--color-muted)" }}>
                <p style={{ margin: 0 }}>{tEvents("noSpecificGames")}</p>
              </div>
            )}

            {/* Table Crew Box */}
            <div className="completed-crew-card">
              <div className="completed-crew-title">
                <span>{tEvents("theTableCrew", { count: event.totalHeadcount })}</span>
                {event.location && <span>📍 {event.location}</span>}
              </div>
              <div className="completed-crew-pills">
                {attendeesList.map((a, i) => (
                  <span
                    key={i}
                    className={`completed-crew-pill ${a.isHost ? "host" : ""}`}
                  >
                    {a.isHost ? "🏠" : a.isGuest ? "👤" : "🎲"} {a.name}
                    {a.isHost && tEvents("hostBadge")}
                  </span>
                ))}
              </div>
            </div>

            {/* Footer Call to Action */}
            <div className="completed-footer-actions">
              <div>
                <strong style={{ fontSize: "var(--text-md)", color: "var(--color-ink)" }}>
                  {tEvents("repeatNextWeek")}
                </strong>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--color-muted)" }}>
                  {tEvents("repeatNextWeekDesc")}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button button-small"
                  onClick={handleCopyShareText}
                >
                  {copiedShare ? tEvents("copiedRecap") : tEvents("copyRecap")}
                </button>
                <Link href={`/groups/${groupId}/events`} className="button-secondary button-small">
                  {tEvents("viewGroupCalendar")}
                </Link>
              </div>
            </div>
          </section>
        );
      })()}

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
              {canManage && (
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
                            <strong>
                              {slot.label}: {slot.game.name}
                              {((slot.expansions !== undefined ? slot.expansions : slot.game.expansions)?.length ?? 0) > 0 && (
                                <span className="game-attached-expansions-tag">
                                  {" + "}{(slot.expansions !== undefined ? slot.expansions : slot.game.expansions)!.map((e) => cleanExpansionName(slot.game.name, e.name)).join(", ")}
                                </span>
                              )}
                            </strong>
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
                    {canManage && (
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
            {canManage && (
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

      {/* Menu Planner Section - hidden when completed or when an official selection is already marked */}
      {!isCompleted && !hasOfficialSelection ? (
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

                {availableCategories.length > 0 && (
                  <div className="field" style={{ marginTop: "14px" }}>
                    <label htmlFor="event-theme-category">
                      🎭 Night Theme &amp; Setting <span style={{ fontWeight: "normal", color: "var(--muted)" }}>(Optional)</span>
                    </label>
                    <select
                      id="event-theme-category"
                      className="select"
                      value={themeCategory}
                      onChange={(e) => setThemeCategory(e.target.value)}
                    >
                      <option value="">🎲 Open Collection (No specific theme)</option>
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <p className="field-hint" style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 0" }}>
                      Anchor the menu generation to a setting from attendee collections (e.g. Horror, Fantasy, Sci-Fi).
                    </p>
                  </div>
                )}

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

                {canManage && event?.menuPoll?.status !== "OPEN" && (
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
                                {slot.addedMechanics && slot.addedMechanics.length > 0 && (
                                  <span className="slot-role-badge" title={`Added by expansion: ${slot.addedMechanics.join(", ")}`}>
                                    ✨ +{slot.addedMechanics.join(", ")}
                                  </span>
                                )}
                                <span className="slot-time-badge">⏱️ ~{slot.estimatedMinutes} min</span>
                              </div>
                              <GameCard
                                game={{
                                  ...slot.game,
                                  expansions: (slot.expansions !== undefined ? slot.expansions : slot.game.expansions)?.map((e) => ({
                                    bggId: e.bggId,
                                    name: e.name,
                                    maxPlayers: typeof (e as { maxPlayers?: number | null }).maxPlayers === "number" ? (e as { maxPlayers?: number | null }).maxPlayers! : null,
                                  })),
                                  weight: slot.effectiveWeight ?? slot.game.weight,
                                  playingTime: slot.estimatedMinutes,
                                }}
                                owners={slot.game.owners}
                              />
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
                          {slot.addedMechanics && slot.addedMechanics.length > 0 && (
                            <span className="slot-role-badge" title={`Added by expansion: ${slot.addedMechanics.join(", ")}`}>
                              ✨ +{slot.addedMechanics.join(", ")}
                            </span>
                          )}
                          <span className="slot-time-badge">⏱️ ~{slot.estimatedMinutes} min</span>
                        </div>
                        <GameCard
                          game={{
                            ...slot.game,
                            expansions: (slot.expansions !== undefined ? slot.expansions : slot.game.expansions)?.map((e) => ({
                              bggId: e.bggId,
                              name: e.name,
                              maxPlayers: typeof (e as { maxPlayers?: number | null }).maxPlayers === "number" ? (e as { maxPlayers?: number | null }).maxPlayers! : null,
                            })),
                            weight: slot.effectiveWeight ?? slot.game.weight,
                            playingTime: slot.estimatedMinutes,
                          }}
                          owners={slot.game.owners}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="draw-actions">
                  {canManage && (
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
                {canManage && (
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
      ) : !isCompleted && hasOfficialSelection ? (
        <section
          className="panel"
          style={{
            textAlign: "center",
            padding: "24px 20px",
            marginTop: "16px",
            background: "var(--color-paper, #f9fafb)",
            border: "1px dashed var(--border)",
          }}
        >
          <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
            🔒 <strong>Tonight&apos;s game selection is marked as official.</strong>
            {canManage
              ? " Need to plan a different lineup? Click '✕ Clear Official Pick' above to unlock the menu planner."
              : " Game night menu is set! Check the announcement above."}
          </p>
        </section>
      ) : null}

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
                <span className="eyebrow" style={{ color: "#166534" }}>{tEvents("wrapUpTitle")}</span>
                <h2 style={{ margin: "4px 0" }}>{tEvents("whichGamesPlayedTitle")}</h2>
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
              {tEvents("verifyAttendanceAndGamesDesc")}
            </p>

            {/* Who actually attended section */}
            <div style={{ marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  {tEvents("whoAttendedTitle")}
                </h4>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  {tEvents("peopleConfirmed", { count: attendedUserIds.length + attendedGuestNames.length })}
                </span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 10px" }}>
                {tEvents("checkAttendanceDesc")}
              </p>

              {/* Members */}
              <div style={{ marginBottom: "12px" }}>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>
                  {tEvents("groupMembersLabel")}
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px", maxHeight: "150px", overflowY: "auto" }}>
                  {groupMembers.map((m) => {
                    const checked = attendedUserIds.includes(m.userId);
                    return (
                      <label
                        key={m.userId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: checked ? "1px solid #16a34a" : "1px solid var(--border)",
                          background: checked ? "#f0fdf4" : "var(--color-paper, #f9fafb)",
                          fontSize: "13px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleAttendee(m.userId)}
                        />
                        <span style={{ fontWeight: checked ? 600 : 400 }}>{m.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Named Guests */}
              <div>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>
                  {tEvents("namedGuestsLabel", { count: attendedGuestNames.length })}
                </span>
                {attendedGuestNames.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                    {attendedGuestNames.map((name) => (
                      <span
                        key={name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "#f0fdf4",
                          border: "1px solid #16a34a",
                          borderRadius: "16px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#166534",
                        }}
                      >
                        👤 {name}
                        <button
                          type="button"
                          onClick={() => handleToggleGuest(name)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontSize: "12px",
                            padding: "0 2px",
                            lineHeight: 1,
                          }}
                          title={tEvents("removeGuest")}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", maxWidth: "340px" }}>
                  <input
                    type="text"
                    placeholder={tEvents("addWalkInGuestPlaceholder")}
                    value={walkInGuestInput}
                    onChange={(e) => setWalkInGuestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddWalkInGuest();
                      }
                    }}
                    style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px" }}
                  />
                  <button
                    type="button"
                    className="button-secondary button-small"
                    onClick={() => handleAddWalkInGuest()}
                    disabled={!walkInGuestInput.trim()}
                  >
                    {tEvents("addGuestButton")}
                  </button>
                </div>
              </div>
            </div>

            {/* Played games in sequence */}
            <div style={{ marginBottom: "20px", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  {tEvents("playedGamesSequenceTitle", { count: playedGameIds.length })}
                </h4>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                  {tEvents("playOrderHint")}
                </span>
              </div>

              {playedGameIds.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--muted)", margin: "4px 0" }}>
                  {tEvents("noGamesSelectedYet")}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {playedGameIds.map((bggId, index) => {
                    const gameName = gameNameMap.get(bggId) ?? `Game #${bggId}`;
                    return (
                      <div
                        key={bggId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "#f0fdf4",
                          border: "1px solid #86efac",
                          borderRadius: "6px",
                          fontSize: "13px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, color: "#166534" }}>{index + 1}️⃣</span>
                          <strong>{gameName}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            className="button-quiet button-small"
                            style={{ padding: "2px 6px", fontSize: "12px" }}
                            title={tEvents("moveEarlier")}
                            disabled={index === 0}
                            onClick={() => handleMovePlayedGame(index, "up")}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="button-quiet button-small"
                            style={{ padding: "2px 6px", fontSize: "12px" }}
                            title={tEvents("moveLater")}
                            disabled={index === playedGameIds.length - 1}
                            onClick={() => handleMovePlayedGame(index, "down")}
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className="button-quiet button-small"
                            style={{ padding: "2px 6px", fontSize: "12px", color: "var(--color-danger, #dc2626)" }}
                            title={tEvents("removeFromPlayedList")}
                            onClick={() => handleRemovePlayedGame(bggId)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Planned games section */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                {tEvents("plannedGamesInSession")}
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {event?.officialLineup && event.officialLineup.length > 0 ? (
                  event.officialLineup.map((s) => {
                    const checked = playedGameIds.includes(s.bggId);
                    const orderIndex = playedGameIds.indexOf(s.bggId);
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
                        {checked && (
                          <span style={{ fontSize: "12px", color: "#166534", fontWeight: 700 }}>
                            {tEvents("inPlayOrder", { order: orderIndex + 1 })}
                          </span>
                        )}
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
                      <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--muted)" }}>({tEvents("featuredGameBadge")})</span>
                    </div>
                    {playedGameIds.includes(event.officialPick.bggId) && (
                      <span style={{ fontSize: "12px", color: "#166534", fontWeight: 700 }}>
                        {tEvents("inPlayOrder", { order: playedGameIds.indexOf(event.officialPick.bggId) + 1 })}
                      </span>
                    )}
                  </label>
                ) : (
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>{tEvents("noOfficialGameLocked")}</p>
                )}
              </div>
            </div>

            {/* Other games toggle & search (Group Collection + BoardGameGeek) */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginBottom: "16px" }}>
              <button
                type="button"
                className="button-quiet button-small"
                onClick={() => setShowOtherGames((v) => !v)}
              >
                {showOtherGames ? tEvents("hideAdditionalGames") : tEvents("playedAnotherGamePrompt")}
              </button>

              {showOtherGames && (
                <div style={{ marginTop: "10px" }}>
                  {/* Source selector: Group collection vs BGG */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                    <button
                      type="button"
                      className={`button-small ${otherGameSource === "group" ? "button" : "button-secondary"}`}
                      style={{ fontSize: "12px", padding: "4px 10px" }}
                      onClick={() => setOtherGameSource("group")}
                    >
                      {tEvents("groupLibraryTab", { count: groupGamesList.length })}
                    </button>
                    <button
                      type="button"
                      className={`button-small ${otherGameSource === "bgg" ? "button" : "button-secondary"}`}
                      style={{ fontSize: "12px", padding: "4px 10px" }}
                      onClick={() => setOtherGameSource("bgg")}
                    >
                      {tEvents("searchBggTab")}
                    </button>
                  </div>

                  {otherGameSource === "group" ? (
                    <>
                      <input
                        type="search"
                        placeholder={tEvents("searchGroupGamePlaceholder")}
                        value={otherGameSearch}
                        onChange={(e) => setOtherGameSearch(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          fontSize: "13px",
                          background: "var(--color-paper, #f9fafb)",
                          marginBottom: "8px",
                          boxSizing: "border-box",
                        }}
                      />

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "12px", color: "var(--muted)" }}>
                        <span>{tEvents("showingCountOfTotal", { count: filteredOtherGames.length, total: groupGamesList.length })}</span>
                        {otherGameSearch && (
                          <button
                            type="button"
                            className="button-quiet button-small"
                            style={{ padding: "0 4px", fontSize: "11px" }}
                            onClick={() => setOtherGameSearch("")}
                          >
                            {tEvents("clearSearch")}
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                        {filteredOtherGames.length === 0 ? (
                          <div style={{ textAlign: "center", padding: "12px 0" }}>
                            <p style={{ margin: "0 0 6px", fontSize: "13px", color: "var(--muted)" }}>
                              {tEvents("noGroupGamesMatching", { query: otherGameSearch })}
                            </p>
                            <button
                              type="button"
                              className="button-secondary button-small"
                              onClick={() => {
                                setOtherGameSource("bgg");
                                setBggQuery(otherGameSearch);
                              }}
                            >
                              {tEvents("searchOnBggInstead")}
                            </button>
                          </div>
                        ) : (
                          filteredOtherGames.map((g) => {
                            const checked = playedGameIds.includes(g.bggId);
                            const orderIndex = playedGameIds.indexOf(g.bggId);
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
                                {checked && (
                                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "#166534", fontWeight: 700 }}>
                                    #{orderIndex + 1}
                                  </span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        type="search"
                        placeholder={tEvents("searchBggAnyPlaceholder")}
                        value={bggQuery}
                        onChange={(e) => setBggQuery(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          fontSize: "13px",
                          background: "var(--color-paper, #f9fafb)",
                          marginBottom: "8px",
                          boxSizing: "border-box",
                        }}
                      />

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "12px", color: "var(--muted)" }}>
                        <span>
                          {bggSearching
                            ? tEvents("searchingBggCatalog")
                            : bggQuery.trim().length < 2
                            ? tEvents("typeAtLeast2Chars")
                            : tEvents("foundBggMatches", { count: bggResults.length })}
                        </span>
                        {bggQuery && (
                          <button
                            type="button"
                            className="button-quiet button-small"
                            style={{ padding: "0 4px", fontSize: "11px" }}
                            onClick={() => {
                              setBggQuery("");
                              setBggResults([]);
                            }}
                          >
                            {tEvents("clear")}
                          </button>
                        )}
                      </div>

                      {bggError && (
                        <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--color-danger, #dc2626)" }}>
                          {bggError}
                        </p>
                      )}

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                        {bggQuery.trim().length >= 2 && !bggSearching && bggResults.length === 0 ? (
                          <p style={{ margin: "10px 0", fontSize: "13px", color: "var(--muted)", textAlign: "center" }}>
                            {tEvents("noBggMatchesFound", { query: bggQuery })}
                          </p>
                        ) : (
                          bggResults.map((g) => {
                            const checked = playedGameIds.includes(g.bggId);
                            const orderIndex = playedGameIds.indexOf(g.bggId);
                            return (
                              <div
                                key={g.bggId}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  border: checked ? "1px solid #16a34a" : "1px solid var(--border)",
                                  background: checked ? "#f0fdf4" : "var(--color-paper, #f9fafb)",
                                  fontSize: "13px",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                                  <span>🎲</span>
                                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {g.name}
                                  </strong>
                                  {g.yearPublished && (
                                    <span style={{ fontSize: "11px", color: "var(--muted)", flexShrink: 0 }}>
                                      ({g.yearPublished})
                                    </span>
                                  )}
                                  <span style={{ fontSize: "10px", color: "var(--muted)", padding: "1px 5px", background: "rgba(0,0,0,0.05)", borderRadius: "4px" }}>
                                    BGG #{g.bggId}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={`button-small ${checked ? "button-secondary" : "button"}`}
                                  style={{ padding: "3px 8px", fontSize: "12px", flexShrink: 0 }}
                                  onClick={() => {
                                    if (checked) {
                                      handleRemovePlayedGame(g.bggId);
                                    } else {
                                      handleAddBggGame(g);
                                    }
                                  }}
                                >
                                  {checked ? tEvents("addedOrder", { order: orderIndex + 1 }) : tEvents("add")}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
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
                {tEvents("cancel")}
              </button>
              <button
                type="button"
                className="button"
                style={{ background: "#15803d", borderColor: "#166534" }}
                disabled={closingEvent}
                onClick={() => void handleConfirmCloseEvent()}
              >
                {closingEvent ? tEvents("wrappingUp") : tEvents("confirmAndWrapUp", { attended: attendedUserIds.length + attendedGuestNames.length, played: playedGameIds.length })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Details Modal */}
      {showEditModal && (
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
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="panel"
            style={{
              maxWidth: "540px",
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
                <span className="eyebrow">{tEvents("manageEvent")}</span>
                <h2 style={{ margin: "4px 0" }}>{tEvents("editEventDetailsTitle")}</h2>
              </div>
              <button
                type="button"
                className="button-quiet button-small"
                onClick={() => setShowEditModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="field">
                <label htmlFor="edit-event-title">{tEvents("eventTitleLabel")}</label>
                <input
                  id="edit-event-title"
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-event-date">{tEvents("dateTimeLabel")}</label>
                <input
                  id="edit-event-date"
                  type="datetime-local"
                  required
                  value={editScheduledDate}
                  onChange={(e) => setEditScheduledDate(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-event-host">{tEvents("eventHostLabel")}</label>
                <select
                  id="edit-event-host"
                  value={editHostUserId}
                  onChange={(e) => setEditHostUserId(e.target.value)}
                >
                  <option value="">{tEvents("noSpecificHost")}</option>
                  {groupMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{tEvents("hostHomeGamesHint")}</span>
              </div>

              <div className="field">
                <label htmlFor="edit-event-location">{tEvents("locationVenueLabel")}</label>
                <input
                  id="edit-event-location"
                  type="text"
                  placeholder={tEvents("locationPlaceholder")}
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-event-desc">{tEvents("notesDescriptionLabel")}</label>
                <input
                  id="edit-event-desc"
                  type="text"
                  placeholder={tEvents("notesPlaceholder")}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-event-headcount">{tEvents("overrideHeadcountLabel")}</label>
                <input
                  id="edit-event-headcount"
                  type="number"
                  min={1}
                  placeholder={tEvents("overrideHeadcountPlaceholder")}
                  value={editManualHeadcount}
                  onChange={(e) => setEditManualHeadcount(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={savingEdit}
                  onClick={() => setShowEditModal(false)}
                >
                  {tEvents("cancel")}
                </button>
                <button
                  type="submit"
                  className="button"
                  disabled={savingEdit}
                >
                  {savingEdit ? tEvents("savingChanges") : tEvents("saveChanges")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {managingGuestAttendee && (
        <GuestRsvpModal
          isOpen={Boolean(managingGuestAttendee)}
          onClose={() => setManagingGuestAttendee(null)}
          eventTitle={`${event?.title ?? ""} · ${tEvents("manageGuestsOf", { name: managingGuestAttendee.displayName })}`}
          initialGuestNames={managingGuestAttendee.guestNames}
          onSave={handleSaveAttendeeGuests}
        />
      )}

      {selectedModalGame && (
        <GameDetailModal
          game={selectedModalGame}
          isOpen={Boolean(selectedModalGame)}
          onClose={() => setSelectedModalGame(null)}
        />
      )}
    </div>
  );
}
