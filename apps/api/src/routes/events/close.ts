import type { FastifyInstance } from "fastify";
import { eventCloseSchema } from "@tablefolk/contracts";
import { requireUser } from "../../auth.js";
import { db } from "../../db.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { getBggGame } from "../../services/bgg.js";
import { fetchCover } from "../../services/cover-store.js";
import { canManageEvent, eventInclude, serializeEventDetail } from "./shared.js";

export async function eventCloseRoutes(app: FastifyInstance) {
  app.post("/v1/events/:eventId/close", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    if (!canManageEvent(event, user.id)) {
      throw forbidden("Only the event creator, host, or group creator can close the event.");
    }

    const body = eventCloseSchema.parse(request.body);

    if (body.attendedUserIds) {
      const attendedSet = new Set(body.attendedUserIds);
      for (const attendeeId of body.attendedUserIds) {
        await db().eventRsvp.upsert({
          where: { eventId_userId: { eventId, userId: attendeeId } },
          create: {
            eventId,
            userId: attendeeId,
            status: "ATTENDING",
            additionalGuests: 0,
          },
          update: {
            status: "ATTENDING",
          },
        });
      }

      const existingAttending = await db().eventRsvp.findMany({
        where: { eventId, status: "ATTENDING" },
      });
      for (const prev of existingAttending) {
        if (!attendedSet.has(prev.userId)) {
          await db().eventRsvp.update({
            where: { id: prev.id },
            data: { status: "DECLINED" },
          });
        }
      }
    }

    // Ensure all played games exist in DB even if added on the fly from BoardGameGeek
    if (body.playedBggIds && body.playedBggIds.length > 0) {
      const existing = await db().game.findMany({
        where: { bggId: { in: body.playedBggIds } },
        select: { bggId: true },
      });
      const existingSet = new Set(existing.map((g) => g.bggId));
      const missing = body.playedBggIds.filter((id) => !existingSet.has(id));

      for (const missingId of missing) {
        try {
          const details = await getBggGame(missingId);
          let coverUrl: string | null = null;
          if (details.imageUrl) {
            const cover = await fetchCover(details.imageUrl);
            if (cover) {
              await db().gameCover.upsert({
                where: { bggId: missingId },
                create: { bggId: missingId, contentType: cover.contentType, data: cover.data },
                update: { contentType: cover.contentType, data: cover.data },
              });
              coverUrl = `/v1/covers/${missingId}`;
            } else {
              coverUrl = details.imageUrl;
            }
          }
          await db().game.upsert({
            where: { bggId: missingId },
            update: {
              ...(coverUrl ? { coverUrl } : {}),
              weight: details.weight ?? undefined,
              rating: details.rating ?? undefined,
              rank: details.rank ?? undefined,
              bestPlayers: details.bestPlayers ?? undefined,
              lastEnrichedAt: new Date(),
            },
            create: {
              bggId: missingId,
              kind: details.kind,
              name: details.name,
              alternateNames: details.alternateNames,
              yearPublished: details.yearPublished,
              description: details.description,
              minPlayers: details.minPlayers,
              maxPlayers: details.maxPlayers,
              baseGameBggId: details.baseGameBggId ?? null,
              baseGameTitle: details.baseGameTitle ?? null,
              playingTime: details.playingTime,
              minPlayingTime: details.minPlayingTime,
              maxPlayingTime: details.maxPlayingTime,
              weight: details.weight,
              rating: details.rating ?? null,
              rank: details.rank ?? null,
              bestPlayers: details.bestPlayers ?? null,
              minAge: details.minAge,
              designers: details.designers,
              publishers: details.publishers,
              categories: details.categories,
              mechanics: details.mechanics,
              coverUrl,
              sourceUrl: details.sourceUrl,
              lastEnrichedAt: new Date(),
            },
          });
        } catch {
          try {
            await db().game.upsert({
              where: { bggId: missingId },
              update: {},
              create: {
                bggId: missingId,
                kind: "boardgame",
                name: `Board Game #${missingId}`,
                alternateNames: [],
                yearPublished: null,
                description: null,
                minPlayers: 1,
                maxPlayers: 10,
                playingTime: null,
                minPlayingTime: null,
                maxPlayingTime: null,
                weight: null,
                minAge: null,
                designers: [],
                publishers: [],
                categories: [],
                mechanics: [],
                sourceUrl: `https://boardgamegeek.com/boardgame/${missingId}`,
                lastEnrichedAt: new Date(),
              },
            });
          } catch {
            // ignore
          }
        }
      }
    }

    const updated = await db().event.update({
      where: { id: eventId },
      data: {
        status: "COMPLETED",
        playedBggIds: body.playedBggIds,
        confirmedGuestNames: body.attendedGuestNames ?? [],
      },
      include: eventInclude,
    });

    // Reset interest points ONLY for games that were ACTUALLY played
    if (body.playedBggIds.length > 0) {
      const clearedInterests = await db().gameInterest.findMany({
        where: {
          groupId: event.groupId,
          bggId: { in: body.playedBggIds },
        },
      });

      await db().gameInterest.deleteMany({
        where: {
          groupId: event.groupId,
          bggId: { in: body.playedBggIds },
        },
      });

      // Clamp available unspent points in this group so they never exceed 5 in hand
      const affectedUserIds = [...new Set(clearedInterests.map((ci) => ci.userId))];
      for (const uid of affectedUserIds) {
        const member = await db().groupMember.findUnique({
          where: { groupId_userId: { groupId: event.groupId, userId: uid } },
        });
        if (member) {
          const remainingInterests = await db().gameInterest.findMany({
            where: { groupId: event.groupId, userId: uid },
          });
          const remainingUsed = remainingInterests.reduce((sum, i) => sum + i.points, 0);
          const liquid = member.votingPoints - remainingUsed;
          if (liquid > 5) {
            await db().groupMember.update({
              where: { groupId_userId: { groupId: event.groupId, userId: uid } },
              data: { votingPoints: remainingUsed + 5 },
            });
          }
        }
      }
    }

    return { event: await serializeEventDetail(updated, user.id) };
  });
}
