import type { FastifyInstance } from "fastify";
import {
  eventCreateSchema,
  eventUpdateSchema,
  eventRsvpSchema,
  eventPickSchema,
  sessionPlanSchema,
  eventSetOfficialSchema,
  type EventDetail,
  type EventRsvpMember,
  type PickResult,
  type SessionLineupResult,
  type OfficialLineupItem,
} from "@tablefolk/contracts";
import { Prisma } from "../generated/prisma/client.js";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { eligibleGameIds, chooseWeightedGameId, planSessionLineup } from "../lib/picker.js";
import { groupGames, gameDto } from "../lib/serialize.js";

export async function eventRoutes(app: FastifyInstance) {
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
        host: { select: { id: true, displayName: true } },
        officialPick: true,
        rsvps: {
          include: { user: { select: { id: true, displayName: true, bggUsername: true } } },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return {
      events: events.map((e): EventDetail => {
        const attendingRsvps = e.rsvps.filter((r) => r.status === "ATTENDING");
        const totalHeadcount = e.manualHeadcount !== null
          ? e.manualHeadcount
          : attendingRsvps.reduce((acc, r) => acc + 1 + r.additionalGuests, 0);

        return {
          id: e.id,
          groupId: e.groupId,
          title: e.title,
          description: e.description,
          scheduledDate: e.scheduledDate.toISOString(),
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
          createdAt: e.createdAt.toISOString(),
          rsvps: e.rsvps.map((r): EventRsvpMember => ({
            userId: r.user.id,
            displayName: r.user.displayName,
            bggUsername: r.user.bggUsername,
            status: r.status as "ATTENDING" | "DECLINED" | "MAYBE",
            additionalGuests: r.additionalGuests,
            updatedAt: r.updatedAt.toISOString(),
          })),
        };
      }),
    };
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

    const attendingRsvps = event.rsvps.filter((r) => r.status === "ATTENDING");
    const totalHeadcount = event.manualHeadcount !== null
      ? event.manualHeadcount
      : attendingRsvps.reduce((acc, r) => acc + 1 + r.additionalGuests, 0);

    return {
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
        totalHeadcount,
        status: event.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
        officialPickBggId: event.officialPickBggId,
        officialPick: event.officialPick ? gameDto(event.officialPick) : null,
        officialPickCarrier: event.officialPickCarrier ?? null,
        officialLineup: (event.officialLineup as unknown as OfficialLineupItem[]) ?? null,
        createdAt: event.createdAt.toISOString(),
        rsvps: event.rsvps.map((r) => ({
          userId: r.user.id,
          displayName: r.user.displayName,
          bggUsername: r.user.bggUsername,
          status: r.status as "ATTENDING" | "DECLINED" | "MAYBE",
          additionalGuests: r.additionalGuests,
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
    };
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

    // Map expansions brought by attendees to their base games
    const attendeeExpansions = new Map<number, number>();
    for (const share of activeShares) {
      if (share.game.baseGameBggId && share.game.maxPlayers) {
        const current = attendeeExpansions.get(share.game.baseGameBggId) ?? 0;
        attendeeExpansions.set(share.game.baseGameBggId, Math.max(current, share.game.maxPlayers));
      }
    }

    const availableGroupGames = groupGames(activeShares, { interestMap }).map((g) => {
      const matchingShares = activeShares.filter((s) => s.bggId === g.bggId);
      const ownerOverride = matchingShares.reduce(
        (max, s) => Math.max(max, s.collection?.maxPlayersOverride ?? 0),
        0
      );
      const expansionMax = attendeeExpansions.get(g.bggId) ?? 0;
      const effectiveMax = Math.max(g.maxPlayers ?? 0, ownerOverride, expansionMax);
      return {
        ...g,
        effectiveMaxPlayers: effectiveMax > (g.maxPlayers ?? 0) ? effectiveMax : g.maxPlayers,
      };
    });

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

    // Weights: Base weight 1 + interest points
    const weightsMap = new Map<number, number>();
    for (const id of eligibleIds) {
      weightsMap.set(id, 1 + (interestMap.get(id) ?? 0));
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

    // Winning decay: reset/reduce interest votes on the winning game
    await db().gameInterest.deleteMany({
      where: {
        groupId: event.groupId,
        bggId: chosenId,
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
      weightsMap.set(game.bggId, 1 + (interestMap.get(game.bggId) ?? 0));
    }

    const result = planSessionLineup(availableGroupGames, {
      playerCount: headcount,
      totalMinutes: body.totalMinutes,
      allowHeavy: body.allowHeavy,
      weightsMap,
      excludeBggIds: body.excludeBggIds,
    });

    return result;
  });
}
