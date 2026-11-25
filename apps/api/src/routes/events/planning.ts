import type { FastifyInstance } from "fastify";
import {
  eventPickSchema,
  sessionPlanSchema,
  eventMenuVoteSchema,
  eventMenuPollCloseSchema,
  type PickResult,
  type SessionLineupResult,
  type SessionMenuTrioResult,
  type EventMenuOption,
  type EventMenuPoll,
  type OfficialLineupItem,
} from "@tablefolk/contracts";
import { Prisma } from "../../generated/prisma/client.js";
import { requireUser } from "../../auth.js";
import { db } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
import {
  eligibleGameIds,
  chooseWeightedGameId,
  planSessionLineup,
  planSessionMenuTrio,
} from "../../lib/picker.js";
import {
  canManageEvent,
  eventInclude,
  loadEventEligibleContext,
  serializeEventDetail,
} from "./shared.js";

export async function eventPlanningRoutes(app: FastifyInstance) {
  app.post("/v1/events/:eventId/pick", async (request): Promise<PickResult> => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };
    const body = eventPickSchema.parse(request.body ?? {});

    const ctx = await loadEventEligibleContext(eventId, user.id, body.playerCount);
    if (ctx.headcount <= 0) {
      return { status: "no_match", eligibleCount: 0, unknownPlayerCount: 0 };
    }
    if (ctx.isEmpty) {
      return { status: "empty", eligibleCount: 0 };
    }

    const eligibleIds = eligibleGameIds(ctx.availableGroupGames, {
      playerCount: ctx.headcount,
      maxDuration: body.maxDuration,
      maxWeight: body.maxWeight,
    });

    if (eligibleIds.length === 0) {
      return { status: "no_match", eligibleCount: 0, unknownPlayerCount: 0 };
    }

    const chosenId = chooseWeightedGameId(eligibleIds, ctx.weightsMap, body.excludeBggId);
    const chosenGame = ctx.availableGroupGames.find((g) => g.bggId === chosenId)!;

    await db().eventPick.create({
      data: {
        eventId,
        bggId: chosenId,
        playerCount: ctx.headcount,
      },
    });

    return {
      status: "picked",
      game: chosenGame,
      eligibleCount: eligibleIds.length,
      onlyMatch: eligibleIds.length === 1,
    };
  });

  app.post("/v1/events/:eventId/lineup", async (request): Promise<SessionLineupResult> => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };
    const body = sessionPlanSchema.parse(request.body ?? {});

    const ctx = await loadEventEligibleContext(eventId, user.id, body.playerCount);
    if (ctx.headcount <= 0 || ctx.isEmpty) {
      return {
        status: ctx.isEmpty ? "empty" : "no_match",
        lineup: [],
        totalEstimatedMinutes: 0,
        transitionMinutes: 0,
        targetMinutes: body.totalMinutes,
        hasHeavy: false,
      };
    }

    return planSessionLineup(ctx.availableGroupGames, {
      playerCount: ctx.headcount,
      totalMinutes: body.totalMinutes,
      allowHeavy: body.allowHeavy,
      weightsMap: ctx.weightsMap,
      excludeBggIds: body.excludeBggIds,
      mechanicsAffinity: body.mechanicsAffinity,
      themeCategory: body.themeCategory,
      recipeId: body.recipeId,
    });
  });

  app.post("/v1/events/:eventId/menu-trio", async (request): Promise<SessionMenuTrioResult> => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };
    const body = sessionPlanSchema.parse(request.body ?? {});

    const ctx = await loadEventEligibleContext(eventId, user.id, body.playerCount);
    if (ctx.headcount <= 0 || ctx.isEmpty) {
      return { status: ctx.isEmpty ? "empty" : "no_match", options: [] };
    }

    return planSessionMenuTrio(ctx.availableGroupGames, {
      playerCount: ctx.headcount,
      totalMinutes: body.totalMinutes,
      allowHeavy: body.allowHeavy,
      weightsMap: ctx.weightsMap,
      excludeBggIds: body.excludeBggIds,
      mechanicsAffinity: body.mechanicsAffinity,
      themeCategory: body.themeCategory,
    });
  });

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

    if (!canManageEvent(event, user.id)) {
      throw forbidden("Only the event creator, host, or group creator can open voting.");
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
      include: eventInclude,
    });

    return { event: await serializeEventDetail(updated, user.id) };
  });

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
      include: eventInclude,
    });

    return { event: await serializeEventDetail(updated, user.id) };
  });

  app.post("/v1/events/:eventId/menu-poll/close", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    if (!canManageEvent(event, user.id)) {
      throw forbidden("Only the event creator, host, or group creator can close voting.");
    }

    const poll = event.menuPoll as unknown as EventMenuPoll | null;
    if (!poll || poll.options.length === 0) {
      throw new AppError(400, "NO_POLL", "No active menu poll found.");
    }

    const body = eventMenuPollCloseSchema.parse(request.body ?? {});

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
        expansions: slot.expansions ?? (slot.game.expansions?.map((e) => ({ bggId: e.bggId, name: e.name })) ?? []),
        effectiveWeight: slot.effectiveWeight,
        addedMechanics: slot.addedMechanics,
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
      include: eventInclude,
    });

    return { event: await serializeEventDetail(updated, user.id) };
  });
}
