import type { FastifyInstance } from "fastify";
import { shareSchema } from "@tablefolk/contracts";
import { requireMember, requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

export async function shareRoutes(app: FastifyInstance) {
  app.post("/v1/groups/:groupId/shares", async (request, reply) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    const { bggId } = shareSchema.parse(request.body);
    await requireMember(groupId, user.id);
    const item = await db().collectionItem.findUnique({
      where: { userId_bggId: { userId: user.id, bggId } },
      include: { game: true },
    });
    if (!item) throw new AppError(400, "NOT_COLLECTED", "Add this game to your collection before sharing it.");

    // Find all owned expansions for this game if it's a base game
    const ownedExpansions = await db().collectionItem.findMany({
      where: {
        userId: user.id,
        game: { baseGameBggId: bggId },
      },
      select: { bggId: true },
    });

    const bggIdsToShare = [bggId, ...ownedExpansions.map((e) => e.bggId)];

    // If sharing an expansion directly and user owns the base game, also share the base game
    if (item.game.baseGameBggId) {
      const baseItem = await db().collectionItem.findUnique({
        where: { userId_bggId: { userId: user.id, bggId: item.game.baseGameBggId } },
      });
      if (baseItem && !bggIdsToShare.includes(item.game.baseGameBggId)) {
        bggIdsToShare.push(item.game.baseGameBggId);
      }
    }

    for (const id of bggIdsToShare) {
      await db().groupShare.upsert({
        where: { groupId_userId_bggId: { groupId, userId: user.id, bggId: id } },
        create: { groupId, userId: user.id, bggId: id },
        update: {},
      });
    }

    audit("game.shared", { groupId, actorId: user.id, bggId, sharedExpansionsCount: ownedExpansions.length });
    return reply.code(201).send({ shared: true, sharedCount: bggIdsToShare.length });
  });

  app.delete("/v1/groups/:groupId/shares/:bggId", async (request, reply) => {
    const user = await requireUser(request);
    const { groupId, bggId: rawId } = request.params as { groupId: string; bggId: string };
    const bggId = Number(rawId);
    if (!Number.isInteger(bggId) || bggId < 1) throw new AppError(400, "INVALID_ID", "Invalid game ID");
    await requireMember(groupId, user.id);
    const share = await db().groupShare.findUnique({ where: { groupId_userId_bggId: { groupId, userId: user.id, bggId } } });
    if (!share) throw notFound("Share not found");

    // Also unshare owned expansions of this base game for this group
    const ownedExpansions = await db().collectionItem.findMany({
      where: {
        userId: user.id,
        game: { baseGameBggId: bggId },
      },
      select: { bggId: true },
    });

    const bggIdsToUnshare = [bggId, ...ownedExpansions.map((e) => e.bggId)];

    await db().groupShare.deleteMany({
      where: {
        groupId,
        userId: user.id,
        bggId: { in: bggIdsToUnshare },
      },
    });

    audit("game.unshared", { groupId, actorId: user.id, bggId, unsharedExpansionsCount: ownedExpansions.length });
    return reply.code(204).send();
  });
}
