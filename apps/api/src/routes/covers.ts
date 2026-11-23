import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";
import { getBggGame } from "../services/bgg.js";
import { fetchCover } from "../services/cover-store.js";

export async function coverRoutes(app: FastifyInstance) {
  app.get("/v1/covers/:bggId", async (request, reply) => {
    const bggId = Number((request.params as { bggId: string }).bggId);
    if (!Number.isInteger(bggId) || bggId < 1) throw new AppError(400, "INVALID_ID", "Invalid game ID");

    let cover = await db().gameCover.findUnique({ where: { bggId } });
    if (!cover && config.coverStorageAllowed) {
      try {
        const details = await getBggGame(bggId);
        if (details.imageUrl) {
          const fetched = await fetchCover(details.imageUrl);
          if (fetched) {
            cover = await db().gameCover.upsert({
              where: { bggId },
              create: { bggId, contentType: fetched.contentType, data: fetched.data },
              update: { contentType: fetched.contentType, data: fetched.data },
            });
            await db().game.updateMany({
              where: { bggId },
              data: { coverUrl: `/v1/covers/${bggId}` },
            });
          }
        }
      } catch {
        // Silently fall through to notFound below
      }
    }

    if (!cover) throw notFound("Cover not found");
    return reply
      .header("Content-Type", cover.contentType)
      .header("Cache-Control", "public, max-age=86400")
      .send(Buffer.from(cover.data));
  });
}

