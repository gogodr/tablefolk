import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";

export async function coverRoutes(app: FastifyInstance) {
  app.get("/v1/covers/:bggId", async (request, reply) => {
    const bggId = Number((request.params as { bggId: string }).bggId);
    if (!Number.isInteger(bggId) || bggId < 1) throw new AppError(400, "INVALID_ID", "Invalid game ID");
    const cover = await db().gameCover.findUnique({ where: { bggId } });
    if (!cover) throw notFound("Cover not found");
    return reply
      .header("Content-Type", cover.contentType)
      .header("Cache-Control", "public, max-age=86400")
      .send(Buffer.from(cover.data));
  });
}
