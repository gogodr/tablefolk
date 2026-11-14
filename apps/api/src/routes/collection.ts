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
import { getBggGame, getBggCollection, getBggGamesBatch } from "../services/bgg.js";
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

    // Map expansions owned by the user to their base games
    const expansionsByBase = new Map<number, { bggId: number; name: string; maxPlayers: number | null }[]>();
    for (const item of items) {
      if (item.game.baseGameBggId) {
        const list = expansionsByBase.get(item.game.baseGameBggId) ?? [];
        list.push({
          bggId: item.game.bggId,
          name: item.game.name,
          maxPlayers: item.game.maxPlayers,
        });
        expansionsByBase.set(item.game.baseGameBggId, list);
      }
    }

    return {
      games: items.map((item) => {
        const ownedExpansions = expansionsByBase.get(item.bggId) ?? [];
        const expansionMax = ownedExpansions.reduce(
          (max, exp) => Math.max(max, exp.maxPlayers ?? 0),
          0
        );
        const effectiveMaxPlayers =
          item.maxPlayersOverride ??
          (expansionMax > (item.game.maxPlayers ?? 0) ? expansionMax : item.game.maxPlayers);

        return {
          ...gameDto(item.game),
          sharedGroupIds: item.shares.map((share) => share.groupId),
          isAvailable: item.isAvailable,
          unavailableReason: item.unavailableReason,
          versionName: item.versionName,
          maxPlayersOverride: item.maxPlayersOverride,
          isStandalone: item.isStandalone,
          effectiveMaxPlayers,
          expansionCount: ownedExpansions.length,
          expansions: ownedExpansions,
        };
      }),
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
        maxPlayersOverride: body.maxPlayersOverride !== undefined ? body.maxPlayersOverride : item.maxPlayersOverride,
        isStandalone: body.isStandalone !== undefined ? body.isStandalone : item.isStandalone,
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
        maxPlayersOverride: updated.maxPlayersOverride,
        isStandalone: updated.isStandalone,
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
  app.get("/v1/user/bgg-profile", async (request) => {
    const user = await requireUser(request);
    const dbUser = await db().user.findUnique({ where: { id: user.id } });
    return {
      bggUsername: dbUser?.bggUsername ?? null,
      lastBggSyncAt: dbUser?.lastBggSyncAt ? dbUser.lastBggSyncAt.toISOString() : null,
    };
  });

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

    // Rate limit check: max 1 sync every 30 seconds
    if (dbUser?.lastBggSyncAt && Date.now() - dbUser.lastBggSyncAt.getTime() < 30 * 1000) {
      throw new AppError(429, "SYNC_TOO_FREQUENT", "Collection was synced recently. Please wait a few seconds before syncing again.");
    }

    const bggItems = await getBggCollection(bggUsername);
    let importedCount = 0;
    let updatedCount = 0;

    for (const item of bggItems) {
      // Check if game already exists with a local cached cover (/v1/covers/:bggId)
      const existingGame = await db().game.findUnique({
        where: { bggId: item.bggId },
        select: { coverUrl: true },
      });
      const coverUrlToUpdate = existingGame?.coverUrl?.startsWith("/v1/covers/")
        ? existingGame.coverUrl
        : (item.imageUrl ?? existingGame?.coverUrl ?? undefined);

      // Upsert game record including image URL and kind
      await db().game.upsert({
        where: { bggId: item.bggId },
        update: {
          name: item.name,
          kind: item.kind,
          yearPublished: item.yearPublished,
          minPlayers: item.minPlayers,
          maxPlayers: item.maxPlayers,
          playingTime: item.playingTime,
          minPlayingTime: item.minPlayingTime,
          maxPlayingTime: item.maxPlayingTime,
          weight: item.weight ?? undefined,
          coverUrl: coverUrlToUpdate,
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
          coverUrl: item.imageUrl,
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
        // Update versionName if provided by BGG and not set
        if (item.versionName && !existing.versionName) {
          await db().collectionItem.update({
            where: { userId_bggId: { userId: user.id, bggId: item.bggId } },
            data: { versionName: item.versionName },
          });
          updatedCount++;
        }
      }
    }

    // Automatically batch-enrich a gentle slice of games (up to 12 items) during initial sync
    const missingWeightIds = bggItems
      .filter((item) => item.weight === null)
      .map((item) => item.bggId)
      .slice(0, 12);

    if (missingWeightIds.length > 0) {
      try {
        const enrichedDetails = await getBggGamesBatch(missingWeightIds);
        for (const [bggId, details] of enrichedDetails) {
          const existingGame = await db().game.findUnique({
            where: { bggId },
            select: { coverUrl: true },
          });

          let coverUrl = existingGame?.coverUrl;

          // Attempt to download and cache cover into Tablefolk's local DB if not yet cached
          if (!coverUrl?.startsWith("/v1/covers/")) {
            const targetUrl = details.imageUrl ?? coverUrl ?? null;
            if (targetUrl) {
              try {
                const cover = await fetchCover(targetUrl);
                if (cover) {
                  await db().gameCover.upsert({
                    where: { bggId },
                    create: { bggId, contentType: cover.contentType, data: cover.data },
                    update: { contentType: cover.contentType, data: cover.data },
                  });
                  coverUrl = `/v1/covers/${bggId}`;
                }
              } catch (coverErr) {
                console.warn(`Could not cache cover for game ${bggId}:`, coverErr);
              }
            }
          }

          if (!coverUrl && details.imageUrl) {
            coverUrl = details.imageUrl;
          }

          await db().game.update({
            where: { bggId },
            data: {
              kind: details.kind,
              weight: details.weight,
              baseGameBggId: details.baseGameBggId ?? undefined,
              baseGameTitle: details.baseGameTitle ?? undefined,
              coverUrl: coverUrl ?? undefined,
              description: details.description ?? undefined,
              designers: details.designers.length ? details.designers : undefined,
              publishers: details.publishers.length ? details.publishers : undefined,
              categories: details.categories.length ? details.categories : undefined,
            },
          });
        }
      } catch (err) {
        console.warn("Background batch enrichment notice:", err);
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

  app.post("/v1/collection/enrich", async (request) => {
    const user = await requireUser(request);
    const items = await db().collectionItem.findMany({
      where: { userId: user.id },
      include: { game: true },
    });

    const candidates = items
      .filter(
        (item) =>
          item.game.weight === null ||
          !item.game.coverUrl ||
          !item.game.coverUrl.startsWith("/v1/covers/")
      )
      .map((item) => item.bggId);

    const batch = candidates.slice(0, 15);
    let enrichedCount = 0;

    if (batch.length > 0) {
      const enrichedDetails = await getBggGamesBatch(batch);
      for (const [bggId, details] of enrichedDetails) {
        const existingGame = await db().game.findUnique({
          where: { bggId },
          select: { coverUrl: true },
        });

        let coverUrl = existingGame?.coverUrl;

        // Attempt to download and store cover into Tablefolk's local DB if not yet cached
        if (!coverUrl?.startsWith("/v1/covers/")) {
          const targetUrl = details.imageUrl ?? coverUrl ?? null;
          if (targetUrl) {
            try {
              const cover = await fetchCover(targetUrl);
              if (cover) {
                await db().gameCover.upsert({
                  where: { bggId },
                  create: { bggId, contentType: cover.contentType, data: cover.data },
                  update: { contentType: cover.contentType, data: cover.data },
                });
                coverUrl = `/v1/covers/${bggId}`;
              }
            } catch (coverErr) {
              console.warn(`Could not cache cover for game ${bggId}:`, coverErr);
            }
          }
        }

        if (!coverUrl && details.imageUrl) {
          coverUrl = details.imageUrl;
        }

        await db().game.update({
          where: { bggId },
          data: {
            kind: details.kind,
            weight: details.weight,
            baseGameBggId: details.baseGameBggId ?? undefined,
            baseGameTitle: details.baseGameTitle ?? undefined,
            coverUrl: coverUrl ?? undefined,
            description: details.description ?? undefined,
            designers: details.designers.length ? details.designers : undefined,
            publishers: details.publishers.length ? details.publishers : undefined,
            categories: details.categories.length ? details.categories : undefined,
          },
        });
        enrichedCount++;
      }
    }

    return {
      enrichedCount,
      remainingCount: Math.max(0, candidates.length - batch.length),
      totalCandidates: candidates.length,
    };
  });
}
