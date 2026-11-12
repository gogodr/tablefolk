import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth.js";
import { searchBgg } from "../services/bgg.js";

const querySchema = z.object({ q: z.string().trim().min(2).max(80) });

export async function catalogRoutes(app: FastifyInstance) {
  app.get("/v1/catalog/search", async (request) => {
    await requireUser(request);
    const { q } = querySchema.parse(request.query);
    return { games: await searchBgg(q) };
  });
}
