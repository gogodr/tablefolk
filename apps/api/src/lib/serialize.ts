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
    maxPlayersOverride?: number | null;
    isStandalone?: boolean | null;
  } | null;
};

export interface GroupGameOptions {
  interestMap?: Map<number, number>;
  userVotesMap?: Map<number, number>;
}

export function groupGames(shares: ShareWithRelations[], options: GroupGameOptions = {}): GroupGame[] {
  // Collect all expansions shared in this group mapped by base game BGG ID
  const expansionsByBase = new Map<number, { bggId: number; name: string; maxPlayers: number | null }[]>();
  for (const share of shares) {
    if (share.game.baseGameBggId) {
      const list = expansionsByBase.get(share.game.baseGameBggId) ?? [];
      if (!list.some((e) => e.bggId === share.game.bggId)) {
        list.push({
          bggId: share.game.bggId,
          name: share.game.name,
          maxPlayers: share.game.maxPlayers,
        });
        expansionsByBase.set(share.game.baseGameBggId, list);
      }
    }
  }

  const byId = new Map<number, GroupGame>();
  for (const share of shares) {
    let entry = byId.get(share.bggId);
    if (!entry) {
      const attachedExpansions = expansionsByBase.get(share.bggId) ?? [];
      entry = {
        ...gameDto(share.game),
        owners: [],
        interestScore: options.interestMap?.get(share.bggId) ?? 0,
        userVotedPoints: options.userVotesMap?.get(share.bggId) ?? 0,
        expansions: attachedExpansions,
        expansionCount: attachedExpansions.length,
        isStandalone: share.collection?.isStandalone ?? false,
      };
      byId.set(share.bggId, entry);
    } else if (share.collection?.isStandalone) {
      entry.isStandalone = true;
    }
    const owner: GameOwner = {
      userId: share.user.id,
      displayName: share.user.displayName,
      bggUsername: share.user.bggUsername ?? null,
      versionName: share.collection?.versionName ?? null,
      isAvailable: share.collection?.isAvailable ?? true,
      unavailableReason: share.collection?.unavailableReason ?? null,
      isStandalone: share.collection?.isStandalone ?? false,
    };
    entry.owners.push(owner);
  }

  // Calculate effectiveMaxPlayers considering owner overrides and attached expansions
  for (const game of byId.values()) {
    const matchingShares = shares.filter((s) => s.bggId === game.bggId);
    const ownerOverride = matchingShares.reduce(
      (max, s) => Math.max(max, s.collection?.maxPlayersOverride ?? 0),
      0
    );
    const expansionMax = (game.expansions ?? []).reduce(
      (max, exp) => Math.max(max, exp.maxPlayers ?? 0),
      0
    );
    const effectiveMax = Math.max(game.maxPlayers ?? 0, ownerOverride, expansionMax);
    game.effectiveMaxPlayers = effectiveMax > (game.maxPlayers ?? 0) ? effectiveMax : game.maxPlayers;
  }

  return [...byId.values()]
    .map((game) => ({ ...game, owners: game.owners.sort((a, b) => a.displayName.localeCompare(b.displayName)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
