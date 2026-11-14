import type { FastifyInstance } from "fastify";
import { pickSchema, sessionPlanSchema, type SessionLineupResult } from "@tablefolk/contracts";
import { requireMember, requireUser } from "../auth.js";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { chooseWeightedGameId, eligibleGameIds, planSessionLineup } from "../lib/picker.js";
import { groupGames } from "../lib/serialize.js";

export async function pickRoutes(app: FastifyInstance) {
  // Single Game Roulette for Groups
  app.post("/v1/groups/:groupId/picks", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    const { playerCount, excludeBggId, maxDuration, maxWeight } = pickSchema.parse(request.body);
    await requireMember(groupId, user.id);

    const shares = await db().groupShare.findMany({
      where: { groupId },
      include: {
        game: true,
        collection: true,
        user: { select: { id: true, displayName: true } },
      },
    });

    if (shares.length === 0) {
      audit("pick.empty", { groupId, actorId: user.id, playerCount });
      return { status: "empty", eligibleCount: 0 };
    }

    // Retrieve group interests for weighted voting
    const interests = await db().gameInterest.findMany({
      where: { groupId },
    });
    const interestMap = new Map<number, number>();
    for (const interest of interests) {
      interestMap.set(interest.bggId, (interestMap.get(interest.bggId) ?? 0) + interest.points);
    }

    const games = groupGames(shares, { interestMap });

    const eligibleIds = eligibleGameIds(games, {
      playerCount,
      maxDuration,
      maxWeight,
    });

    if (eligibleIds.length === 0) {
      const unknownPlayerCount = games
        .filter((g) => g.kind !== "boardgameexpansion" && !g.baseGameBggId)
        .filter((game) => game.minPlayers === null || game.maxPlayers === null).length;
      audit("pick.no_match", { groupId, actorId: user.id, playerCount, unknownPlayerCount });
      return { status: "no_match", eligibleCount: 0, unknownPlayerCount };
    }

    // Weights: Base weight 1 + interest points (including from attached expansions)
    const weightsMap = new Map<number, number>();
    for (const g of games) {
      const basePoints = interestMap.get(g.bggId) ?? 0;
      const expansionPoints = (g.expansions ?? []).reduce(
        (sum, exp) => sum + (interestMap.get(exp.bggId) ?? 0),
        0
      );
      weightsMap.set(g.bggId, 1 + basePoints + expansionPoints);
    }

    const bggId = chooseWeightedGameId(eligibleIds, weightsMap, excludeBggId);
    const game = games.find((entry) => entry.bggId === bggId)!;
    audit("pick.selected", { groupId, actorId: user.id, playerCount, eligibleCount: eligibleIds.length, bggId });
    return { status: "picked", game, eligibleCount: eligibleIds.length, onlyMatch: eligibleIds.length === 1 };
  });

  // Session Menu Planner (Lineup) for Groups
  app.post("/v1/groups/:groupId/lineup", async (request): Promise<SessionLineupResult> => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    const body = sessionPlanSchema.parse(request.body ?? {});

    await requireMember(groupId, user.id);

    const shares = await db().groupShare.findMany({
      where: { groupId },
      include: {
        game: true,
        collection: true,
        user: { select: { id: true, displayName: true } },
      },
    });

    if (shares.length === 0) {
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
      where: { groupId },
    });

    const interestMap = new Map<number, number>();
    for (const interest of interests) {
      interestMap.set(interest.bggId, (interestMap.get(interest.bggId) ?? 0) + interest.points);
    }

    const availableGroupGames = groupGames(shares, { interestMap });

    const weightsMap = new Map<number, number>();
    for (const g of availableGroupGames) {
      const basePoints = interestMap.get(g.bggId) ?? 0;
      const expansionPoints = (g.expansions ?? []).reduce(
        (sum, exp) => sum + (interestMap.get(exp.bggId) ?? 0),
        0
      );
      weightsMap.set(g.bggId, 1 + basePoints + expansionPoints);
    }

    const result = planSessionLineup(availableGroupGames, {
      playerCount: body.playerCount ?? 4,
      totalMinutes: body.totalMinutes,
      allowHeavy: body.allowHeavy,
      weightsMap,
      excludeBggIds: body.excludeBggIds ?? [],
    });

    audit("group.lineup_planned", {
      groupId,
      actorId: user.id,
      playerCount: body.playerCount ?? 4,
      totalMinutes: body.totalMinutes,
      lineupCount: result.lineup.length,
    });

    return result;
  });
}
