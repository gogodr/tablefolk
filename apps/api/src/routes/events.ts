import type { FastifyInstance } from "fastify";
import {
  eventCreateSchema,
  eventUpdateSchema,
  eventRsvpSchema,
  eventPickSchema,
  sessionPlanSchema,
  eventSetOfficialSchema,
  eventMenuVoteSchema,
  eventMenuPollCloseSchema,
  eventCloseSchema,
  type EventDetail,
  type EventRsvpMember,
  type PickResult,
  type SessionLineupResult,
  type SessionMenuTrioResult,
  type EventMenuOption,
  type EventMenuPoll,
  type OfficialLineupItem,
} from "@tablefolk/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { eligibleGameIds, chooseWeightedGameId, planSessionLineup, planSessionMenuTrio } from "../lib/picker.js";
import { groupGames, gameDto } from "../lib/serialize.js";

async function serializeEventDetail(e: any): Promise<EventDetail> {
  const attendingRsvps = (e.rsvps ?? []).filter((r: any) => r.status === "ATTENDING");
  const totalHeadcount = e.manualHeadcount !== null && e.manualHeadcount !== undefined
    ? e.manualHeadcount
    : attendingRsvps.reduce((acc: number, r: any) => acc + 1 + r.additionalGuests, 0);

  let playedGames: any[] | undefined = undefined;
  const playedBggIds: number[] = Array.isArray(e.playedBggIds) ? e.playedBggIds : [];
  if (playedBggIds.length > 0) {
    const games = await db().game.findMany({
      where: { bggId: { in: playedBggIds } },
    });
    playedGames = games.map(gameDto);
  }

  return {
    id: e.id,
    groupId: e.groupId,
    groupName: e.group?.name,
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
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    rsvps: (e.rsvps ?? []).map((r: any): EventRsvpMember => ({
      userId: r.user?.id ?? r.userId,
      displayName: r.user?.displayName ?? r.displayName ?? "Member",
      bggUsername: r.user?.bggUsername ?? r.bggUsername,
      status: r.status as "ATTENDING" | "DECLINED" | "MAYBE",
      additionalGuests: r.additionalGuests,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    })),
  };
}

export async function eventRoutes(app: FastifyInstance) {
  // List all events across all groups where the user is a member
  app.get("/v1/events", async (request) => {
    const user = await requireUser(request);

    const memberships = await db().groupMember.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    if (groupIds.length === 0) {
      return { events: [] };
    }

    const events = await db().event.findMany({
      where: { groupId: { in: groupIds } },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    const serialized = await Promise.all(events.map(serializeEventDetail));
    return { events: serialized };
  });

  // List events for a group
  app.get("/v1/groups/:groupId/events", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const events = await db().event.findMany({
      where: { groupId },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    const serialized = await Promise.all(events.map(serializeEventDetail));
    return { events: serialized };
  });

  // Create an event
  app.post("/v1/groups/:groupId/events", async (request, reply) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = eventCreateSchema.parse(request.body);

    const event = await db().event.create({
      data: {
        groupId,
        title: body.title,
        description: body.description ?? null,
        scheduledDate: new Date(body.scheduledDate),
        location: body.location ?? null,
        hostUserId: body.hostUserId ?? null,
        manualHeadcount: body.manualHeadcount ?? null,
        rsvps: {
          create: {
            userId: user.id,
            status: "ATTENDING",
            additionalGuests: 0,
          },
        },
      },
      include: {
        host: { select: { id: true, displayName: true } },
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
    });

    return reply.code(201).send({
      event: {
        id: event.id,
        groupId: event.groupId,
        title: event.title,
        description: event.description,
        scheduledDate: event.scheduledDate.toISOString(),
        location: event.location,
        hostUserId: event.hostUserId,
        hostDisplayName: event.host?.displayName ?? null,
        manualHeadcount: event.manualHeadcount,
        totalHeadcount: 1,
        status: event.status,
        officialPickBggId: null,
        officialPick: null,
        officialPickCarrier: null,
        officialLineup: null,
        createdAt: event.createdAt.toISOString(),
        rsvps: event.rsvps.map((r) => ({
          userId: r.user.id,
          displayName: r.user.displayName,
          bggUsername: r.user.bggUsername,
          status: r.status,
          additionalGuests: r.additionalGuests,
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
    });
  });

  // Get event details
  app.get("/v1/events/:eventId", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    return { event: await serializeEventDetail(event) };
  });

  // RSVP to an event
  app.post("/v1/events/:eventId/rsvp", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({ where: { id: eventId } });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = eventRsvpSchema.parse(request.body);

    const rsvp = await db().eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: {
        eventId,
        userId: user.id,
        status: body.status,
        additionalGuests: body.additionalGuests,
      },
      update: {
        status: body.status,
        additionalGuests: body.additionalGuests,
      },
    });

    return { rsvp };
  });

  // Set or update Official Selection for an event (Host only or Group Creator)
  app.put("/v1/events/:eventId/official", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    // Host of the event or group creator can set official picks
    const isHost = event.hostUserId ? event.hostUserId === user.id : true;
    const isGroupCreator = event.group.creatorId === user.id;
    if (!isHost && !isGroupCreator) {
      throw forbidden("Only the event host or group creator can announce the official selection.");
    }

    const body = eventSetOfficialSchema.parse(request.body);

    if (body.type === "clear") {
      const updated = await db().event.update({
        where: { id: eventId },
        data: {
          officialPickBggId: null,
          officialPickCarrier: null,
          officialLineup: Prisma.DbNull,
        },
      });
      return { success: true, officialPickBggId: null, officialPickCarrier: null, officialLineup: null };
    }

    if (body.type === "single") {
      if (!body.bggId) throw new AppError(400, "VALIDATION_ERROR", "bggId is required for single official pick.");
      const updated = await db().event.update({
        where: { id: eventId },
        data: {
          officialPickBggId: body.bggId,
          officialPickCarrier: body.carrierDisplayName ?? null,
          officialLineup: Prisma.DbNull,
        },
        include: { officialPick: true },
      });
      return {
        success: true,
        officialPickBggId: updated.officialPickBggId,
        officialPick: updated.officialPick ? gameDto(updated.officialPick) : null,
        officialPickCarrier: updated.officialPickCarrier ?? null,
        officialLineup: null,
      };
    }

    if (body.type === "lineup") {
      if (!body.lineup || body.lineup.length === 0) {
        throw new AppError(400, "VALIDATION_ERROR", "lineup is required for lineup official pick.");
      }
      const updated = await db().event.update({
        where: { id: eventId },
        data: {
          officialPickBggId: null,
          officialPickCarrier: null,
          officialLineup: body.lineup as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        success: true,
        officialPickBggId: null,
        officialPick: null,
        officialPickCarrier: null,
        officialLineup: updated.officialLineup,
      };
    }

    return { success: true };
  });

  // Event Single Game Night Picker
  app.post("/v1/events/:eventId/pick", async (request): Promise<PickResult> => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: {
        rsvps: true,
      },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = eventPickSchema.parse(request.body ?? {});

    const attendingUserIds = new Set(
      event.rsvps.filter((r) => r.status === "ATTENDING").map((r) => r.userId)
    );

    const headcount = body.playerCount !== undefined
      ? body.playerCount
      : (event.manualHeadcount !== null
        ? event.manualHeadcount
        : event.rsvps
            .filter((r) => r.status === "ATTENDING")
            .reduce((acc, r) => acc + 1 + r.additionalGuests, 0));

    if (headcount <= 0) {
      return { status: "no_match", eligibleCount: 0, unknownPlayerCount: 0 };
    }

    // Load shares for this group
    const shares = await db().groupShare.findMany({
      where: { groupId: event.groupId },
      include: {
        game: true,
        user: { select: { id: true, displayName: true, bggUsername: true } },
        collection: true,
      },
    });

    // Filter shares only from attending members who have game available (or host's home games)
    const activeShares = shares.filter((share) => {
      if (!attendingUserIds.has(share.userId)) return false;
      const isHost = event.hostUserId === share.userId;
      if (isHost) return true;
      return share.collection?.isAvailable ?? true;
    });

    if (activeShares.length === 0) {
      return { status: "empty", eligibleCount: 0 };
    }

    // Load interest votes from attending members
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

    const eligibleIds = eligibleGameIds(
      availableGroupGames,
      {
        playerCount: headcount,
        maxDuration: body.maxDuration,
        maxWeight: body.maxWeight,
      }
    );

    if (eligibleIds.length === 0) {
      return { status: "no_match", eligibleCount: 0, unknownPlayerCount: 0 };
    }

    // Weights: Base weight 1 + interest points (including from attached expansions)
    const weightsMap = new Map<number, number>();
    for (const g of availableGroupGames) {
      const basePoints = interestMap.get(g.bggId) ?? 0;
      const expansionPoints = (g.expansions ?? []).reduce(
        (sum, exp) => sum + (interestMap.get(exp.bggId) ?? 0),
        0
      );
      weightsMap.set(g.bggId, 1 + basePoints + expansionPoints);
    }

    const chosenId = chooseWeightedGameId(eligibleIds, weightsMap, body.excludeBggId);
    const chosenGame = availableGroupGames.find((g) => g.bggId === chosenId)!;

    // Record the pick
    await db().eventPick.create({
      data: {
        eventId,
        bggId: chosenId,
        playerCount: headcount,
      },
    });

    // Winning decay: reset/reduce interest votes on the winning game and its expansions
    const idsToClean = [chosenId, ...(chosenGame.expansions ?? []).map((e) => e.bggId)];
    await db().gameInterest.deleteMany({
      where: {
        groupId: event.groupId,
        bggId: { in: idsToClean },
      },
    });

    return {
      status: "picked",
      game: chosenGame,
      eligibleCount: eligibleIds.length,
      onlyMatch: eligibleIds.length === 1,
    };
  });

  // Event Session Lineup (Multi-Game Menu & Anti-Fatigue)
  app.post("/v1/events/:eventId/lineup", async (request): Promise<SessionLineupResult> => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { rsvps: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = sessionPlanSchema.parse(request.body ?? {});

    const attendingUserIds = new Set(
      event.rsvps.filter((r) => r.status === "ATTENDING").map((r) => r.userId)
    );

    const headcount = body.playerCount !== undefined
      ? body.playerCount
      : (event.manualHeadcount !== null
        ? event.manualHeadcount
        : event.rsvps
            .filter((r) => r.status === "ATTENDING")
            .reduce((acc, r) => acc + 1 + r.additionalGuests, 0));

    if (headcount <= 0) {
      return {
        status: "no_match",
        lineup: [],
        totalEstimatedMinutes: 0,
        transitionMinutes: 0,
        targetMinutes: body.totalMinutes,
        hasHeavy: false,
      };
    }

    // Load shares for this group
    const shares = await db().groupShare.findMany({
      where: { groupId: event.groupId },
      include: {
        game: true,
        user: { select: { id: true, displayName: true, bggUsername: true } },
        collection: true,
      },
    });

    const activeShares = shares.filter((share) => {
      if (!attendingUserIds.has(share.userId)) return false;
      const isHost = event.hostUserId === share.userId;
      if (isHost) return true;
      return share.collection?.isAvailable ?? true;
    });

    if (activeShares.length === 0) {
      return {
        status: "empty",
        lineup: [],
        totalEstimatedMinutes: 0,
        transitionMinutes: 0,
        targetMinutes: body.totalMinutes,
        hasHeavy: false,
      };
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

    const result = planSessionLineup(availableGroupGames, {
      playerCount: headcount,
      totalMinutes: body.totalMinutes,
      allowHeavy: body.allowHeavy,
      weightsMap,
      excludeBggIds: body.excludeBggIds,
      mechanicsAffinity: body.mechanicsAffinity,
    });

    return result;
  });

  // Event Session Menu Trio (Generate 3 Contrasting Lineup Proposals)
  app.post("/v1/events/:eventId/menu-trio", async (request): Promise<SessionMenuTrioResult> => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { rsvps: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = sessionPlanSchema.parse(request.body ?? {});

    const attendingUserIds = new Set(
      event.rsvps.filter((r) => r.status === "ATTENDING").map((r) => r.userId)
    );

    const headcount = body.playerCount !== undefined
      ? body.playerCount
      : (event.manualHeadcount !== null
        ? event.manualHeadcount
        : event.rsvps
            .filter((r) => r.status === "ATTENDING")
            .reduce((acc, r) => acc + 1 + r.additionalGuests, 0));

    if (headcount <= 0) {
      return { status: "no_match", options: [] };
    }

    const shares = await db().groupShare.findMany({
      where: { groupId: event.groupId },
      include: {
        game: true,
        user: { select: { id: true, displayName: true, bggUsername: true } },
        collection: true,
      },
    });

    const activeShares = shares.filter((share) => {
      if (!attendingUserIds.has(share.userId)) return false;
      const isHost = event.hostUserId === share.userId;
      if (isHost) return true;
      return share.collection?.isAvailable ?? true;
    });

    if (activeShares.length === 0) {
      return { status: "empty", options: [] };
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

    const result = planSessionMenuTrio(availableGroupGames, {
      playerCount: headcount,
      totalMinutes: body.totalMinutes,
      allowHeavy: body.allowHeavy,
      weightsMap,
      excludeBggIds: body.excludeBggIds,
      mechanicsAffinity: body.mechanicsAffinity,
    });

    return result;
  });

  // Open Group Voting for 3 Menu Options
  app.post("/v1/events/:eventId/menu-poll/open", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const isHost = event.hostUserId ? event.hostUserId === user.id : true;
    const isGroupCreator = event.group.creatorId === user.id;
    if (!isHost && !isGroupCreator) {
      throw forbidden("Only the host or group creator can open voting.");
    }

    const body = request.body as { options: EventMenuOption[] };
    if (!body?.options || body.options.length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "options are required to open a menu poll.");
    }

    const pollData: EventMenuPoll = {
      status: "OPEN",
      options: body.options.map((opt) => ({
        ...opt,
        votes: opt.votes ?? [],
      })),
      winningOptionId: null,
      updatedAt: new Date().toISOString(),
    };

    const updated = await db().event.update({
      where: { id: eventId },
      data: {
        menuPoll: pollData as unknown as Prisma.InputJsonValue,
      },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
    });

    return { event: await serializeEventDetail(updated) };
  });

  // Cast or change vote on a menu option
  app.post("/v1/events/:eventId/menu-poll/vote", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = eventMenuVoteSchema.parse(request.body);
    const poll = event.menuPoll as unknown as EventMenuPoll | null;

    if (!poll || poll.status !== "OPEN") {
      throw new AppError(400, "POLL_NOT_OPEN", "Menu poll is not currently open for voting.");
    }

    const matchingOption = poll.options.find((o) => o.id === body.optionId);
    if (!matchingOption) {
      throw new AppError(400, "INVALID_OPTION", "Selected menu option does not exist.");
    }

    // Toggle / record vote: remove user vote from all options, then add to chosen option
    const updatedOptions = poll.options.map((opt) => {
      const filteredVotes = (opt.votes ?? []).filter((v) => v.userId !== user.id);
      if (opt.id === body.optionId) {
        filteredVotes.push({
          userId: user.id,
          displayName: user.displayName,
        });
      }
      return { ...opt, votes: filteredVotes };
    });

    const updatedPoll: EventMenuPoll = {
      ...poll,
      options: updatedOptions,
      updatedAt: new Date().toISOString(),
    };

    const updated = await db().event.update({
      where: { id: eventId },
      data: {
        menuPoll: updatedPoll as unknown as Prisma.InputJsonValue,
      },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
    });

    return { event: await serializeEventDetail(updated) };
  });

  // Close poll and lock winning menu as official lineup
  app.post("/v1/events/:eventId/menu-poll/close", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const isHost = event.hostUserId ? event.hostUserId === user.id : true;
    const isGroupCreator = event.group.creatorId === user.id;
    if (!isHost && !isGroupCreator) {
      throw forbidden("Only the host or group creator can close voting.");
    }

    const poll = event.menuPoll as unknown as EventMenuPoll | null;
    if (!poll || poll.options.length === 0) {
      throw new AppError(400, "NO_POLL", "No active menu poll found.");
    }

    const body = eventMenuPollCloseSchema.parse(request.body ?? {});

    // Determine winning option
    let winningOption = poll.options.find((o) => o.id === body.winningOptionId);
    if (!winningOption) {
      winningOption = [...poll.options].sort((a, b) => (b.votes?.length ?? 0) - (a.votes?.length ?? 0))[0];
    }

    if (!winningOption) {
      throw new AppError(400, "NO_WINNER", "Could not determine winning menu option.");
    }

    const officialLineup: OfficialLineupItem[] = winningOption.lineup.map((slot) => {
      const availableOwner = slot.game.owners?.find((o) => o.isAvailable !== false);
      const carrier = availableOwner ? availableOwner.displayName : slot.game.owners?.[0]?.displayName;
      return {
        role: slot.role,
        label: slot.label,
        bggId: slot.game.bggId,
        name: slot.game.name,
        estimatedMinutes: slot.estimatedMinutes,
        carrierDisplayName: carrier,
        expansions: slot.game.expansions?.map((e) => ({ bggId: e.bggId, name: e.name })),
      };
    });

    const updatedPoll: EventMenuPoll = {
      ...poll,
      status: "CLOSED",
      winningOptionId: winningOption.id,
      updatedAt: new Date().toISOString(),
    };

    const updated = await db().event.update({
      where: { id: eventId },
      data: {
        officialLineup: officialLineup as unknown as Prisma.InputJsonValue,
        officialPickBggId: null,
        officialPickCarrier: null,
        menuPoll: updatedPoll as unknown as Prisma.InputJsonValue,
      },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
    });

    return { event: await serializeEventDetail(updated) };
  });

  // Close event and confirm actual played games (decaying interest points ONLY for what was actually played)
  app.post("/v1/events/:eventId/close", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const isHost = event.hostUserId ? event.hostUserId === user.id : true;
    const isGroupCreator = event.group.creatorId === user.id;
    if (!isHost && !isGroupCreator) {
      throw forbidden("Only the event host or group creator can close the event.");
    }

    const body = eventCloseSchema.parse(request.body);

    const updated = await db().event.update({
      where: { id: eventId },
      data: {
        status: "COMPLETED",
        playedBggIds: body.playedBggIds,
      },
      include: {
        group: { select: { id: true, name: true } },
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
    });

    // Reset interest points ONLY for games that were ACTUALLY played
    if (body.playedBggIds.length > 0) {
      await db().gameInterest.deleteMany({
        where: {
          groupId: event.groupId,
          bggId: { in: body.playedBggIds },
        },
      });
    }

    return { event: await serializeEventDetail(updated) };
  });
}
