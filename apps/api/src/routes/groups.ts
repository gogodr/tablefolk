import type { FastifyInstance } from "fastify";
import { groupNameSchema } from "@tablefolk/contracts";
import { requireCreator, requireMember, requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { groupGames } from "../lib/serialize.js";

export async function groupRoutes(app: FastifyInstance) {
  app.get("/v1/groups", async (request) => {
    const user = await requireUser(request);
    const memberships = await db().groupMember.findMany({
      where: { userId: user.id },
      include: { group: { include: { members: true, shares: { select: { bggId: true } } } } },
      orderBy: { joinedAt: "desc" },
    });
    return { groups: memberships.map(({ group }) => ({
      id: group.id,
      name: group.name,
      creatorId: group.creatorId,
      memberCount: group.members.length,
      gameCount: new Set(group.shares.map((share) => share.bggId)).size,
    })) };
  });

  app.post("/v1/groups", async (request, reply) => {
    const user = await requireUser(request);
    const { name } = groupNameSchema.parse(request.body);
    const group = await db().group.create({
      data: { name, creatorId: user.id, members: { create: { userId: user.id } } },
    });
    audit("group.created", { groupId: group.id, actorId: user.id });
    return reply.code(201).send({ group: { id: group.id, name: group.name, creatorId: group.creatorId, memberCount: 1, gameCount: 0 } });
  });

  app.get("/v1/groups/:groupId", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    const group = await requireMember(groupId, user.id);
    const [members, shares] = await Promise.all([
      db().groupMember.findMany({ where: { groupId }, include: { user: true }, orderBy: { joinedAt: "asc" } }),
      db().groupShare.findMany({ where: { groupId }, select: { bggId: true } }),
    ]);
    return { group: {
      id: group.id, name: group.name, creatorId: group.creatorId,
      memberCount: members.length, gameCount: new Set(shares.map((share) => share.bggId)).size,
      members: members.map((member) => ({
        userId: member.userId,
        displayName: member.user.displayName,
        bggUsername: member.user.bggUsername,
      })),
    } };
  });

  app.get("/v1/groups/:groupId/games", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    await requireMember(groupId, user.id);
    const [shares, interests] = await Promise.all([
      db().groupShare.findMany({
        where: { groupId },
        include: {
          game: true,
          user: { select: { id: true, displayName: true, bggUsername: true } },
          collection: { select: { versionName: true, isAvailable: true, unavailableReason: true } },
        },
      }),
      db().gameInterest.findMany({ where: { groupId } }),
    ]);

    const interestMap = new Map<number, number>();
    const userVotesMap = new Map<number, number>();
    for (const interest of interests) {
      interestMap.set(interest.bggId, (interestMap.get(interest.bggId) ?? 0) + interest.points);
      if (interest.userId === user.id) {
        userVotesMap.set(interest.bggId, interest.points);
      }
    }

    return { games: groupGames(shares, { interestMap, userVotesMap }) };
  });

  app.get("/v1/groups/:groupId/members", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    await requireMember(groupId, user.id);
    const members = await db().groupMember.findMany({ where: { groupId }, include: { user: true }, orderBy: { joinedAt: "asc" } });
    return {
      members: members.map((member) => ({
        userId: member.userId,
        displayName: member.user.displayName,
        bggUsername: member.user.bggUsername,
      })),
    };
  });

  app.delete("/v1/groups/:groupId/members/:userId", async (request, reply) => {
    const actor = await requireUser(request);
    const { groupId, userId } = request.params as { groupId: string; userId: string };
    const group = await requireCreator(groupId, actor.id);
    if (userId === group.creatorId) throw new AppError(400, "CANNOT_REMOVE_CREATOR", "The group creator cannot be removed.");
    const existing = await db().groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!existing) throw notFound("Member not found in this group");
    await db().$transaction([
      db().groupShare.deleteMany({ where: { groupId, userId } }),
      db().groupMember.delete({ where: { groupId_userId: { groupId, userId } } }),
    ]);
    audit("member.removed", { groupId, actorId: actor.id, targetUserId: userId });
    return reply.code(204).send();
  });
}
