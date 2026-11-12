export function pickIndex(count: number, random = Math.random): number {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be positive");
  return Math.floor(random() * count);
}

export function eligibleGameIds(
  games: Array<{ bggId: number; minPlayers: number | null; maxPlayers: number | null }>,
  playerCount: number,
): number[] {
  return [...new Set(games
    .filter((game) => game.minPlayers !== null && game.maxPlayers !== null
      && game.minPlayers > 0 && game.maxPlayers >= game.minPlayers
      && game.minPlayers <= playerCount && playerCount <= game.maxPlayers)
    .map((game) => game.bggId))].sort((a, b) => a - b);
}

export function chooseGameId(ids: number[], excludeBggId?: number, random = Math.random): number {
  if (ids.length === 0) throw new Error("No eligible games");
  const pool = ids.length > 1 && excludeBggId !== undefined
    ? ids.filter((id) => id !== excludeBggId)
    : ids;
  return pool[pickIndex(pool.length, random)]!;
}
