import type { FastifyInstance } from "fastify";
import {
  collectionAddSchema,
  collectionAvailabilitySchema,
  bggProfileSchema,
} from "@tablefolk/contracts";
import { requireUser } from "../auth.js";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";
import { gameDto } from "../lib/serialize.js";
import { getBggGame, getBggCollection } from "../services/bgg.js";
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
    return {
      games: items.map((item) => ({
        ...gameDto(item.game),
        sharedGroupIds: item.shares.map((share) => share.groupId),
        isAvailable: item.isAvailable,
        unavailableReason: item.unavailableReason,
        versionName: item.versionName,
      })),
    };
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
            weight: details.weight,
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

  app.patch("/v1/collection/:bggId", async (request) => {
    const user = await requireUser(request);
    const bggId = Number((request.params as { bggId: string }).bggId);
    if (!Number.isInteger(bggId) || bggId < 1) throw new AppError(400, "INVALID_ID", "Invalid game ID");

    const body = collectionAvailabilitySchema.parse(request.body);
    const item = await db().collectionItem.findUnique({
      where: { userId_bggId: { userId: user.id, bggId } },
      include: { game: true },
    });
    if (!item) throw notFound("Game not found in your collection");

    const updated = await db().collectionItem.update({
      where: { userId_bggId: { userId: user.id, bggId } },
      data: {
        isAvailable: body.isAvailable,
        unavailableReason: body.isAvailable ? null : (body.unavailableReason ?? item.unavailableReason),
        versionName: body.versionName !== undefined ? body.versionName : item.versionName,
      },
      include: { game: true, shares: { select: { groupId: true } } },
    });

    return {
      game: {
        ...gameDto(updated.game),
        sharedGroupIds: updated.shares.map((share) => share.groupId),
        isAvailable: updated.isAvailable,
        unavailableReason: updated.unavailableReason,
        versionName: updated.versionName,
      },
    };
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

  // User BGG Profile
  app.put("/v1/user/bgg-profile", async (request) => {
    const user = await requireUser(request);
    const { bggUsername } = bggProfileSchema.parse(request.body);

    const updated = await db().user.update({
      where: { id: user.id },
      data: { bggUsername },
    });

    return { bggUsername: updated.bggUsername };
  });

  // BGG Collection Sync
  app.post("/v1/collection/sync-bgg", async (request) => {
    const user = await requireUser(request);
    const dbUser = await db().user.findUnique({ where: { id: user.id } });
    const bggUsername = dbUser?.bggUsername;
    if (!bggUsername) {
      throw new AppError(400, "NO_BGG_USERNAME", "Please configure your BGG username first.");
    }

    // Rate limit check: max 1 sync every 5 minutes
    if (dbUser?.lastBggSyncAt && Date.now() - dbUser.lastBggSyncAt.getTime() < 5 * 60 * 1000) {
      throw new AppError(429, "SYNC_TOO_FREQUENT", "Collection was synced recently. Please wait 5 minutes before syncing again.");
    }

    const bggItems = await getBggCollection(bggUsername);
    let importedCount = 0;
    let updatedCount = 0;

    for (const item of bggItems) {
      // Upsert game record
      await db().game.upsert({
        where: { bggId: item.bggId },
        update: {
          name: item.name,
          yearPublished: item.yearPublished,
          minPlayers: item.minPlayers,
          maxPlayers: item.maxPlayers,
          playingTime: item.playingTime,
          minPlayingTime: item.minPlayingTime,
          maxPlayingTime: item.maxPlayingTime,
          weight: item.weight,
        },
        create: {
          bggId: item.bggId,
          kind: item.kind,
          name: item.name,
          yearPublished: item.yearPublished,
          minPlayers: item.minPlayers,
          maxPlayers: item.maxPlayers,
          playingTime: item.playingTime,
          minPlayingTime: item.minPlayingTime,
          maxPlayingTime: item.maxPlayingTime,
          weight: item.weight,
          sourceUrl: `https://boardgamegeek.com/boardgame/${item.bggId}`,
        },
      });

      // Check existing collection item
      const existing = await db().collectionItem.findUnique({
        where: { userId_bggId: { userId: user.id, bggId: item.bggId } },
      });

      if (!existing) {
        await db().collectionItem.create({
          data: {
            userId: user.id,
            bggId: item.bggId,
            versionName: item.versionName,
          },
        });
        importedCount++;
      } else {
        // Keep existing isAvailable and unavailableReason intact
        // Only update versionName if user hasn't set a custom one
        if (item.versionName && !existing.versionName) {
          await db().collectionItem.update({
            where: { userId_bggId: { userId: user.id, bggId: item.bggId } },
            data: { versionName: item.versionName },
          });
          updatedCount++;
        }
      }
    }

    await db().user.update({
      where: { id: user.id },
      data: { lastBggSyncAt: new Date() },
    });

    return {
      importedCount,
      updatedCount,
      totalCount: bggItems.length,
    };
  });
}
