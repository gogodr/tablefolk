import { db } from "../../db.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { gameDto, groupGames } from "../../lib/serialize.js";
import type { EventDetail, EventMenuPoll, EventRsvpMember, GroupGame, OfficialLineupItem } from "@tablefolk/contracts";

export const eventInclude = {
  group: { select: { id: true, name: true, creatorId: true } },
  creator: { select: { id: true, displayName: true } },
  host: { select: { id: true, displayName: true } },
  officialPick: true,
  rsvps: {
    include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
  },
} as const;

export function canManageEvent(
  event: { creatorId: string | null; hostUserId: string | null; group: { creatorId: string } },
  userId: string
): boolean {
  const isCreator = event.creatorId ? event.creatorId === userId : true;
  const isHost = event.hostUserId ? event.hostUserId === userId : true;
  const isGroupCreator = event.group.creatorId === userId;
  return isCreator || isHost || isGroupCreator;
}

export function isShareEligibleForEvent(
  share: { userId: string; collection?: { isAvailable?: boolean; unavailableReason?: string | null } | null },
  attendingUserIds: Set<string>,
  hostUserId: string | null
): boolean {
  if (!attendingUserIds.has(share.userId)) return false;
  if (share.collection?.isAvailable ?? true) return true;
  return hostUserId === share.userId && share.collection?.unavailableReason === "HOME_ONLY";
}

export async function serializeEventDetail(e: any, currentUserId?: string): Promise<EventDetail> {
  const attendingRsvps = (e.rsvps ?? []).filter((r: any) => r.status === "ATTENDING");
  const confirmedGuests: string[] = Array.isArray(e.confirmedGuestNames) ? e.confirmedGuestNames : [];
  const totalHeadcount = e.status === "COMPLETED"
    ? attendingRsvps.length + confirmedGuests.length
    : e.manualHeadcount !== null && e.manualHeadcount !== undefined
      ? e.manualHeadcount
      : attendingRsvps.reduce((acc: number, r: any) => {
          const guestCount = Array.isArray(r.guestNames) && r.guestNames.length > 0
            ? r.guestNames.length
            : (r.additionalGuests ?? 0);
          return acc + 1 + guestCount;
        }, 0);

  let playedGames: any[] | undefined = undefined;
  const playedBggIds: number[] = Array.isArray(e.playedBggIds) ? e.playedBggIds : [];
  if (playedBggIds.length > 0) {
    const games = await db().game.findMany({
      where: { bggId: { in: playedBggIds } },
    });
    const gameMap = new Map(games.map((g) => [g.bggId, gameDto(g)]));
    playedGames = playedBggIds.map((id) => gameMap.get(id)).filter(Boolean);
  }

  const isCreator = e.creatorId ? e.creatorId === currentUserId : true;
  const isHost = e.hostUserId ? e.hostUserId === currentUserId : true;
  const isGroupCreator = e.group?.creatorId ? e.group.creatorId === currentUserId : false;
  const canManage = currentUserId ? (isCreator || isHost || isGroupCreator) : true;

  return {
    id: e.id,
    groupId: e.groupId,
    groupName: e.group?.name,
    groupCreatorId: e.group?.creatorId,
    creatorId: e.creatorId ?? null,
    creatorDisplayName: e.creator?.displayName ?? null,
    canManage,
    title: e.title,
    description: e.description,
    scheduledDate: e.scheduledDate instanceof Date ? e.scheduledDate.toISOString() : e.scheduledDate,
    location: e.location,
    hostUserId: e.hostUserId,
    hostDisplayName: e.host?.displayName ?? null,
    manualHeadcount: e.manualHeadcount,
    totalHeadcount,
    status: e.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
    officialPickBggId: e.officialPickBggId,
    officialPick: e.officialPick ? gameDto(e.officialPick) : null,
    officialPickCarrier: e.officialPickCarrier ?? null,
    officialLineup: (e.officialLineup as unknown as OfficialLineupItem[]) ?? null,
    menuPoll: (e.menuPoll as unknown as EventMenuPoll) ?? null,
    playedBggIds,
    playedGames,
    confirmedGuestNames: confirmedGuests,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    rsvps: (e.rsvps ?? []).map((r: any): EventRsvpMember => ({
      userId: r.user?.id ?? r.userId,
      displayName: r.user?.displayName ?? r.displayName ?? "Member",
      bggUsername: r.user?.bggUsername ?? r.bggUsername,
      status: r.status as "ATTENDING" | "DECLINED" | "MAYBE",
      additionalGuests: Array.isArray(r.guestNames) && r.guestNames.length > 0 ? r.guestNames.length : (r.additionalGuests ?? 0),
      guestNames: Array.isArray(r.guestNames) ? r.guestNames : [],
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    })),
  };
}

export interface EventEligibleContext {
  headcount: number;
  availableGroupGames: GroupGame[];
  weightsMap: Map<number, number>;
  isEmpty: boolean;
}

export async function loadEventEligibleContext(
  eventId: string,
  userId: string,
  overridePlayerCount?: number
): Promise<EventEligibleContext> {
  const event = await db().event.findUnique({
    where: { id: eventId },
    include: { rsvps: true },
  });
  if (!event) throw notFound("Event not found");

  const member = await db().groupMember.findUnique({
    where: { groupId_userId: { groupId: event.groupId, userId } },
  });
  if (!member) throw forbidden("You are not a member of this group.");

  const attendingUserIds = new Set(
    event.rsvps.filter((r) => r.status === "ATTENDING").map((r) => r.userId)
  );

  const headcount = overridePlayerCount !== undefined
    ? overridePlayerCount
    : (event.manualHeadcount !== null
      ? event.manualHeadcount
      : event.rsvps
          .filter((r) => r.status === "ATTENDING")
          .reduce((acc, r) => acc + 1 + (r.guestNames?.length || r.additionalGuests || 0), 0));

  if (headcount <= 0) {
    return { headcount: 0, availableGroupGames: [], weightsMap: new Map(), isEmpty: false };
  }

  const shares = await db().groupShare.findMany({
    where: { groupId: event.groupId },
    include: {
      game: true,
      user: { select: { id: true, displayName: true, bggUsername: true } },
      collection: true,
    },
  });

  const activeShares = shares.filter((share) =>
    isShareEligibleForEvent(share, attendingUserIds, event.hostUserId)
  );

  if (activeShares.length === 0) {
    return { headcount, availableGroupGames: [], weightsMap: new Map(), isEmpty: true };
  }

  const interests = await db().gameInterest.findMany({
    where: {
      groupId: event.groupId,
      userId: { in: [...attendingUserIds] },
    },
  });

  const interestMap = new Map<number, number>();
  for (const interest of interests) {
    interestMap.set(interest.bggId, (interestMap.get(interest.bggId) ?? 0) + interest.points);
  }

  const availableGroupGames = groupGames(activeShares, { interestMap });

  const weightsMap = new Map<number, number>();
  for (const game of availableGroupGames) {
    const basePoints = interestMap.get(game.bggId) ?? 0;
    const expansionPoints = (game.expansions ?? []).reduce(
      (sum, exp) => sum + (interestMap.get(exp.bggId) ?? 0),
      0
    );
    weightsMap.set(game.bggId, 1 + basePoints + expansionPoints);
  }

  return { headcount, availableGroupGames, weightsMap, isEmpty: false };
}
