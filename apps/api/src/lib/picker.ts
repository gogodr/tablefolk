import type { GroupGame, SessionGameSlot, SessionLineupResult } from "@tablefolk/contracts";

export function pickIndex(count: number, random = Math.random): number {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be positive");
  return Math.floor(random() * count);
}

export interface CandidateGame {
  bggId: number;
  minPlayers: number | null;
  maxPlayers: number | null;
  effectiveMaxPlayers?: number | null;
  playingTime?: number | null;
  weight?: number | null;
}

export interface PickerFilters {
  playerCount: number;
  maxDuration?: number;
  maxWeight?: number;
}

export function eligibleGameIds(
  games: CandidateGame[],
  filters: number | PickerFilters,
): number[] {
  const playerCount = typeof filters === "number" ? filters : filters.playerCount;
  const maxDuration = typeof filters === "object" ? filters.maxDuration : undefined;
  const maxWeight = typeof filters === "object" ? filters.maxWeight : undefined;

  return [...new Set(games
    .filter((game) => {
      // Player count filter (taking into account effective max players from expansions)
      const effectiveMax = game.effectiveMaxPlayers ?? game.maxPlayers;
      if (
        game.minPlayers === null ||
        effectiveMax === null ||
        game.minPlayers <= 0 ||
        effectiveMax < game.minPlayers ||
        playerCount < game.minPlayers ||
        playerCount > effectiveMax
      ) {
        return false;
      }

      // Duration filter
      if (maxDuration !== undefined && game.playingTime !== null && game.playingTime !== undefined) {
        if (game.playingTime > maxDuration) return false;
      }

      // Weight (complexity) filter
      if (maxWeight !== undefined && game.weight !== null && game.weight !== undefined) {
        if (game.weight > maxWeight) return false;
      }

      return true;
    })
    .map((game) => game.bggId))].sort((a, b) => a - b);
}

export function chooseGameId(ids: number[], excludeBggId?: number, random = Math.random): number {
  if (ids.length === 0) throw new Error("No eligible games");
  const pool = ids.length > 1 && excludeBggId !== undefined
    ? ids.filter((id) => id !== excludeBggId)
    : ids;
  return pool[pickIndex(pool.length, random)]!;
}

export function chooseWeightedGameId(
  ids: number[],
  weights: Map<number, number> | Record<number, number> = {},
  excludeBggId?: number,
  random = Math.random,
): number {
  if (ids.length === 0) throw new Error("No eligible games");
  const pool = ids.length > 1 && excludeBggId !== undefined
    ? ids.filter((id) => id !== excludeBggId)
    : ids;

  const getWeight = (id: number): number => {
    if (weights instanceof Map) {
      return Math.max(1, weights.get(id) ?? 1);
    }
    return Math.max(1, weights[id] ?? 1);
  };

  const totalWeight = pool.reduce((sum, id) => sum + getWeight(id), 0);
  const target = random() * totalWeight;

  let current = 0;
  for (const id of pool) {
    current += getWeight(id);
    if (current >= target) {
      return id;
    }
  }

  return pool[pool.length - 1]!;
}

export interface LineupPlannerOptions {
  playerCount: number;
  totalMinutes: number;
  allowHeavy?: boolean;
  weightsMap?: Map<number, number>;
  excludeBggIds?: number[];
  random?: () => number;
}

export function planSessionLineup(
  availableGames: GroupGame[],
  options: LineupPlannerOptions,
): SessionLineupResult {
  const {
    playerCount,
    totalMinutes,
    allowHeavy = true,
    weightsMap = new Map<number, number>(),
    excludeBggIds = [],
    random = Math.random,
  } = options;

  // Filter games that support the playerCount (including expansion player counts)
  const eligible = availableGames.filter((g) => {
    if (excludeBggIds.includes(g.bggId)) return false;
    const effectiveMax = (g as { effectiveMaxPlayers?: number | null }).effectiveMaxPlayers ?? g.maxPlayers;
    if (g.minPlayers === null || effectiveMax === null) return false;
    return playerCount >= g.minPlayers && playerCount <= effectiveMax;
  });

  if (eligible.length === 0) {
    return {
      status: availableGames.length === 0 ? "empty" : "no_match",
      lineup: [],
      totalEstimatedMinutes: 0,
      targetMinutes: totalMinutes,
      hasHeavy: false,
    };
  }

  // Partition into categories:
  // Heavy: weight > 3.2
  // Medium: 2.2 <= weight <= 3.2 (or default medium if weight null)
  // Light / Filler: weight < 2.2 or playingTime <= 35
  const isHeavy = (g: GroupGame) => (g.weight ?? 0) > 3.2;
  const isLight = (g: GroupGame) => (g.weight ?? 2.0) <= 2.2 || (g.playingTime ?? 60) <= 35;

  let remainingMinutes = totalMinutes;
  let hasHeavyGame = false;
  const selectedLineup: SessionGameSlot[] = [];
  const pickedIds = new Set<number>();

  // 1. Choose Main Event
  // If session is >= 90 mins, we pick a main game
  const mainCandidates = eligible.filter((g) => {
    if (!allowHeavy && isHeavy(g)) return false;
    const duration = g.playingTime ?? 60;
    return duration <= remainingMinutes + 20; // Allow 20m tolerance
  });

  if (mainCandidates.length > 0) {
    const candidateIds = mainCandidates.map((g) => g.bggId);
    const mainId = chooseWeightedGameId(candidateIds, weightsMap, undefined, random);
    const mainGame = mainCandidates.find((g) => g.bggId === mainId)!;
    const mainDuration = mainGame.playingTime ?? 60;

    hasHeavyGame = isHeavy(mainGame);
    pickedIds.add(mainId);
    remainingMinutes -= mainDuration;

    selectedLineup.push({
      role: "main",
      label: hasHeavyGame ? "👑 Plato Fuerte (Juego Pesado)" : "🎯 Juego Principal",
      game: mainGame,
      estimatedMinutes: mainDuration,
    });
  }

  // 2. Anti-fatigue filler selection
  // If we have remaining time (>= 20 mins) and games left:
  // RULE: If main game was heavy, strictly ONLY allow light / filler games!
  while (remainingMinutes >= 20) {
    const fillerCandidates = eligible.filter((g) => {
      if (pickedIds.has(g.bggId)) return false;
      if (hasHeavyGame && !isLight(g)) return false; // Strict anti-fatigue rule
      if (isHeavy(g)) return false; // Never a second heavy game
      const duration = g.playingTime ?? 30;
      return duration <= remainingMinutes + 15;
    });

    if (fillerCandidates.length === 0) break;

    const fillerIds = fillerCandidates.map((g) => g.bggId);
    const chosenId = chooseWeightedGameId(fillerIds, weightsMap, undefined, random);
    const fillerGame = fillerCandidates.find((g) => g.bggId === chosenId)!;
    const duration = fillerGame.playingTime ?? 30;

    pickedIds.add(chosenId);
    remainingMinutes -= duration;

    // Determine role: if only 1 game selected so far, warmup or cooldown
    const role = selectedLineup.length === 1 && remainingMinutes >= 20 ? "warmup" : "cooldown";
    const label = role === "warmup" ? "🍕 Warm-up / Apertura" : "☕ Cooldown / Despedida";

    if (role === "warmup") {
      selectedLineup.unshift({
        role,
        label,
        game: fillerGame,
        estimatedMinutes: duration,
      });
    } else {
      selectedLineup.push({
        role,
        label,
        game: fillerGame,
        estimatedMinutes: duration,
      });
    }

    if (selectedLineup.length >= 3) break; // Maximum 3 games per evening session
  }

  const totalEstimated = selectedLineup.reduce((sum, slot) => sum + slot.estimatedMinutes, 0);

  return {
    status: selectedLineup.length > 0 ? "success" : "no_match",
    lineup: selectedLineup,
    totalEstimatedMinutes: totalEstimated,
    targetMinutes: totalMinutes,
    hasHeavy: hasHeavyGame,
  };
}
