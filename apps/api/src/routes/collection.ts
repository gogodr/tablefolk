import type { FastifyInstance } from "fastify";
import { collectionAddSchema } from "@tablefolk/contracts";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";
import { gameDto } from "../lib/serialize.js";
import { getBggGame } from "../services/bgg.js";
import { fetchCover } from "../services/cover-store.js";
import { config } from "../config.js";

export async function collectionRoutes(app: FastifyInstance) {
  app.get("/v1/collection", async (request) => {
    const user = await requireUser(request);
    const items = await db().collectionItem.findMany({
      where: { userId: user.id },
      include: { game: true, shares: { select: { groupId: true } } },
      orderBy: { addedAt: "desc" },
    });
    return { games: items.map((item) => ({ ...gameDto(item.game), sharedGroupIds: item.shares.map((share) => share.groupId) })) };
  });

  app.post("/v1/collection", async (request, reply) => {
    const user = await requireUser(request);
    const { bggId } = collectionAddSchema.parse(request.body);
    const existing = await db().collectionItem.findUnique({ where: { userId_bggId: { userId: user.id, bggId } } });
    if (existing) throw new AppError(409, "ALREADY_COLLECTED", "This game is already in your collection.");

    let game = await db().game.findUnique({ where: { bggId } });
    if (!game || (config.coverStorageAllowed && !game.coverUrl)) {
      const details = await getBggGame(bggId);
      const cover = await fetchCover(details.imageUrl);
      const coverUrl = cover ? `/v1/covers/${bggId}` : null;
      if (!game) game = await db().$transaction(async (tx) => {
        const imported = await tx.game.upsert({
          where: { bggId },
          update: cover ? { coverUrl } : {},
          create: {
            bggId,
            kind: details.kind,
            name: details.name,
            alternateNames: details.alternateNames,
            yearPublished: details.yearPublished,
            description: details.description,
            minPlayers: details.minPlayers,
            maxPlayers: details.maxPlayers,
            playingTime: details.playingTime,
            minPlayingTime: details.minPlayingTime,
            maxPlayingTime: details.maxPlayingTime,
            minAge: details.minAge,
            designers: details.designers,
            publishers: details.publishers,
            categories: details.categories,
            coverUrl,
            sourceUrl: details.sourceUrl,
          },
        });
        if (cover) {
          await tx.gameCover.upsert({
            where: { bggId },
            create: { bggId, contentType: cover.contentType, data: cover.data },
            update: { contentType: cover.contentType, data: cover.data },
          });
        }
        return imported;
      });
      else if (cover) game = await db().$transaction(async (tx) => {
        await tx.gameCover.upsert({
          where: { bggId },
          create: { bggId, contentType: cover.contentType, data: cover.data },
          update: { contentType: cover.contentType, data: cover.data },
        });
        return tx.game.update({ where: { bggId }, data: { coverUrl } });
      });
    }
    await db().collectionItem.create({ data: { userId: user.id, bggId } });
    return reply.code(201).send({ game: gameDto(game) });
  });

  app.delete("/v1/collection/:bggId", async (request, reply) => {
    const user = await requireUser(request);
    const bggId = Number((request.params as { bggId: string }).bggId);
    if (!Number.isInteger(bggId) || bggId < 1) throw new AppError(400, "INVALID_ID", "Invalid game ID");
    const existing = await db().collectionItem.findUnique({ where: { userId_bggId: { userId: user.id, bggId } } });
    if (!existing) throw notFound("Game not found in your collection");
    await db().collectionItem.delete({ where: { userId_bggId: { userId: user.id, bggId } } });
    return reply.code(204).send();
  });
}
