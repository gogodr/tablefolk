import type { Game as DbGame, GroupShare } from "../generated/prisma/client.js";
import type { Game, GroupGame, Member } from "@tablefolk/contracts";

export function gameDto(game: DbGame): Game {
  return {
    bggId: game.bggId,
    kind: game.kind === "boardgameexpansion" ? "boardgameexpansion" : "boardgame",
    name: game.name,
    yearPublished: game.yearPublished,
    description: game.description,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    playingTime: game.playingTime,
    minAge: game.minAge,
    coverUrl: game.coverUrl,
    sourceUrl: game.sourceUrl,
    designers: game.designers,
    publishers: game.publishers,
    categories: game.categories,
  };
}

export type ShareWithRelations = GroupShare & {
  game: DbGame;
  user: { id: string; displayName: string };
};

export function groupGames(shares: ShareWithRelations[]): GroupGame[] {
  const byId = new Map<number, GroupGame>();
  for (const share of shares) {
    let entry = byId.get(share.bggId);
    if (!entry) {
      entry = { ...gameDto(share.game), owners: [] };
      byId.set(share.bggId, entry);
    }
    const owner: Member = { userId: share.user.id, displayName: share.user.displayName };
    entry.owners.push(owner);
  }
  return [...byId.values()]
    .map((game) => ({ ...game, owners: game.owners.sort((a, b) => a.displayName.localeCompare(b.displayName)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
