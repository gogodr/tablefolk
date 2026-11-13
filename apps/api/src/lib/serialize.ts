import type { Game as DbGame, GroupShare } from "../generated/prisma/client.js";
import type { Game, GroupGame, GameOwner } from "@tablefolk/contracts";

export function gameDto(game: DbGame): Game {
  return {
    bggId: game.bggId,
    kind: game.kind === "boardgameexpansion" ? "boardgameexpansion" : "boardgame",
    name: game.name,
    yearPublished: game.yearPublished,
    description: game.description,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    baseGameBggId: game.baseGameBggId,
    baseGameTitle: game.baseGameTitle,
    playingTime: game.playingTime,
    minPlayingTime: game.minPlayingTime,
    maxPlayingTime: game.maxPlayingTime,
    weight: game.weight,
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
  user: { id: string; displayName: string; bggUsername?: string | null };
  collection?: {
    versionName?: string | null;
    isAvailable?: boolean;
    unavailableReason?: string | null;
  } | null;
};

export interface GroupGameOptions {
  interestMap?: Map<number, number>;
  userVotesMap?: Map<number, number>;
}

export function groupGames(shares: ShareWithRelations[], options: GroupGameOptions = {}): GroupGame[] {
  const byId = new Map<number, GroupGame>();
  for (const share of shares) {
    let entry = byId.get(share.bggId);
    if (!entry) {
      entry = {
        ...gameDto(share.game),
        owners: [],
        interestScore: options.interestMap?.get(share.bggId) ?? 0,
        userVotedPoints: options.userVotesMap?.get(share.bggId) ?? 0,
      };
      byId.set(share.bggId, entry);
    }
    const owner: GameOwner = {
      userId: share.user.id,
      displayName: share.user.displayName,
      bggUsername: share.user.bggUsername ?? null,
      versionName: share.collection?.versionName ?? null,
      isAvailable: share.collection?.isAvailable ?? true,
      unavailableReason: share.collection?.unavailableReason ?? null,
    };
    entry.owners.push(owner);
  }
  return [...byId.values()]
    .map((game) => ({ ...game, owners: game.owners.sort((a, b) => a.displayName.localeCompare(b.displayName)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
