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
    const item = await db().collectionItem.findUnique({ where: { userId_bggId: { userId: user.id, bggId } } });
    if (!item) throw new AppError(400, "NOT_COLLECTED", "Add this game to your collection before sharing it.");
    await db().groupShare.upsert({
      where: { groupId_userId_bggId: { groupId, userId: user.id, bggId } },
      create: { groupId, userId: user.id, bggId },
      update: {},
    });
    audit("game.shared", { groupId, actorId: user.id, bggId });
    return reply.code(201).send({ shared: true });
  });

  app.delete("/v1/groups/:groupId/shares/:bggId", async (request, reply) => {
    const user = await requireUser(request);
    const { groupId, bggId: rawId } = request.params as { groupId: string; bggId: string };
    const bggId = Number(rawId);
    if (!Number.isInteger(bggId) || bggId < 1) throw new AppError(400, "INVALID_ID", "Invalid game ID");
    await requireMember(groupId, user.id);
    const share = await db().groupShare.findUnique({ where: { groupId_userId_bggId: { groupId, userId: user.id, bggId } } });
    if (!share) throw notFound("Share not found");
    await db().groupShare.delete({ where: { groupId_userId_bggId: { groupId, userId: user.id, bggId } } });
    audit("game.unshared", { groupId, actorId: user.id, bggId });
    return reply.code(204).send();
  });
}
