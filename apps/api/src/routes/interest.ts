import type { FastifyInstance } from "fastify";
import { gameInterestVoteSchema } from "@tablefolk/contracts";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, forbidden } from "../lib/errors.js";

export async function interestRoutes(app: FastifyInstance) {
  // Get voting points status and current interest scores for a group
  app.get("/v1/groups/:groupId/interest", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const dbUser = await db().user.findUnique({ where: { id: user.id } });
    const totalPoints = dbUser?.votingPoints ?? 5;

    // Get all interests in this group
    const allInterests = await db().gameInterest.findMany({
      where: { groupId },
    });

    const userInterests = allInterests.filter((i) => i.userId === user.id);
    const usedPoints = userInterests.reduce((sum, i) => sum + i.points, 0);

    const scoresByGame: Record<number, number> = {};
    for (const interest of allInterests) {
      scoresByGame[interest.bggId] = (scoresByGame[interest.bggId] ?? 0) + interest.points;
    }

    const userVotesByGame: Record<number, number> = {};
    for (const interest of userInterests) {
      userVotesByGame[interest.bggId] = interest.points;
    }

    return {
      summary: {
        totalPoints,
        usedPoints,
        availablePoints: Math.max(0, totalPoints - usedPoints),
      },
      scoresByGame,
      userVotesByGame,
    };
  });

  // Vote or add points to a game in the group
  app.post("/v1/groups/:groupId/interest", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = gameInterestVoteSchema.parse(request.body);

    // Verify game is in this group
    const isShared = await db().groupShare.findFirst({
      where: { groupId, bggId: body.bggId },
    });
    if (!isShared) {
      throw new AppError(404, "GAME_NOT_IN_GROUP", "This game is not shared in the group.");
    }

    const dbUser = await db().user.findUnique({ where: { id: user.id } });
    const totalPoints = dbUser?.votingPoints ?? 5;

    // Check user's current allocated points
    const currentVotes = await db().gameInterest.findMany({
      where: { groupId, userId: user.id },
    });

    const currentGameVote = currentVotes.find((v) => v.bggId === body.bggId)?.points ?? 0;
    const currentOtherVotes = currentVotes
      .filter((v) => v.bggId !== body.bggId)
      .reduce((sum, v) => sum + v.points, 0);

    const newUsedPoints = currentOtherVotes + body.points;
    if (newUsedPoints > totalPoints) {
      throw new AppError(
        400,
        "INSUFFICIENT_VOTING_POINTS",
        `You only have ${Math.max(0, totalPoints - currentOtherVotes)} voting points available.`
      );
    }

    await db().gameInterest.upsert({
      where: {
        groupId_userId_bggId: {
          groupId,
          userId: user.id,
          bggId: body.bggId,
        },
      },
      create: {
        groupId,
        userId: user.id,
        bggId: body.bggId,
        points: body.points,
      },
      update: {
        points: body.points,
      },
    });

    return {
      success: true,
      bggId: body.bggId,
      points: body.points,
      availablePoints: totalPoints - newUsedPoints,
    };
  });
}
