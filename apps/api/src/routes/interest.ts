import type { FastifyInstance } from "fastify";
import { gameInterestVoteSchema } from "@tablefolk/contracts";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, forbidden } from "../lib/errors.js";

function hasMondayPassed(lastRefill: Date | null, now: Date = new Date()): boolean {
  if (!lastRefill) return true;

  // Day of week in UTC: 0 = Sun, 1 = Mon, ..., 6 = Sat
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const currentWeekMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  ));

  return lastRefill.getTime() < currentWeekMonday.getTime();
}

async function ensureWeeklyRefill(userId: string, groupId: string) {
  const member = await db().groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member) return { totalPoints: 5, availablePoints: 5, usedPoints: 0 };

  const now = new Date();
  let totalPoints = member.votingPoints;

  const userInterests = await db().gameInterest.findMany({
    where: { groupId, userId },
  });
  const usedPoints = userInterests.reduce((sum, i) => sum + i.points, 0);
  let availablePoints = Math.max(0, totalPoints - usedPoints);

  if (hasMondayPassed(member.lastPointsRefillAt, now)) {
    // Reload up to +3 points per week, with a strict cap of 5 liquid unspent points
    if (availablePoints < 5) {
      const pointsToAdd = Math.min(3, 5 - availablePoints);
      if (pointsToAdd > 0) {
        totalPoints += pointsToAdd;
        availablePoints += pointsToAdd;
        await db().groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: {
            votingPoints: totalPoints,
            lastPointsRefillAt: now,
          },
        });
      } else {
        await db().groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { lastPointsRefillAt: now },
        });
      }
    } else {
      await db().groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { lastPointsRefillAt: now },
      });
    }
  }

  return { totalPoints, availablePoints, usedPoints };
}

export async function interestRoutes(app: FastifyInstance) {
  // Get voting points status and current interest scores for a group
  app.get("/v1/groups/:groupId/interest", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const { totalPoints, availablePoints, usedPoints } = await ensureWeeklyRefill(user.id, groupId);

    // Get all interests in this group
    const allInterests = await db().gameInterest.findMany({
      where: { groupId },
    });

    const userInterests = allInterests.filter((i) => i.userId === user.id);

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
        availablePoints,
        maxLiquidPoints: 5,
        weeklyAllowance: 3,
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

    const { totalPoints } = await ensureWeeklyRefill(user.id, groupId);

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
