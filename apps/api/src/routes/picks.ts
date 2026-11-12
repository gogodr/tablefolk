import type { FastifyInstance } from "fastify";
import { pickSchema } from "@tablefolk/contracts";
import { requireMember, requireUser } from "../auth.js";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { chooseGameId, eligibleGameIds } from "../lib/picker.js";
import { groupGames } from "../lib/serialize.js";

export async function pickRoutes(app: FastifyInstance) {
  app.post("/v1/groups/:groupId/picks", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    const { playerCount, excludeBggId } = pickSchema.parse(request.body);
    await requireMember(groupId, user.id);
    const shares = await db().groupShare.findMany({
      where: { groupId }, include: { game: true, user: { select: { id: true, displayName: true } } },
    });
    if (shares.length === 0) {
      audit("pick.empty", { groupId, actorId: user.id, playerCount });
      return { status: "empty", eligibleCount: 0 };
    }
    const games = groupGames(shares);
    const eligibleIds = eligibleGameIds(games, playerCount);
    if (eligibleIds.length === 0) {
      const unknownPlayerCount = games.filter((game) => game.minPlayers === null || game.maxPlayers === null).length;
      audit("pick.no_match", { groupId, actorId: user.id, playerCount, unknownPlayerCount });
      return { status: "no_match", eligibleCount: 0, unknownPlayerCount };
    }
    const bggId = chooseGameId(eligibleIds, excludeBggId);
    const game = games.find((entry) => entry.bggId === bggId)!;
    audit("pick.selected", { groupId, actorId: user.id, playerCount, eligibleCount: eligibleIds.length, bggId });
    return { status: "picked", game, eligibleCount: eligibleIds.length, onlyMatch: eligibleIds.length === 1 };
  });
}
