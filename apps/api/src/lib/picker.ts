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

export const TRANSITION_BUFFER_MINUTES = 15;

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
      transitionMinutes: 0,
      targetMinutes: totalMinutes,
      hasHeavy: false,
    };
  }

  // Helper classification
  const isHeavy = (g: GroupGame) => (g.weight ?? 0) > 3.2;
  const isLight = (g: GroupGame) => (g.weight ?? 2.0) <= 2.2;
  const getDuration = (g: GroupGame) => g.playingTime ?? 45;

  let remainingMinutes = totalMinutes;
  let hasHeavyGame = false;
  const selectedLineup: SessionGameSlot[] = [];
  const pickedIds = new Set<number>();

  // 1. Choose Main Event (Centerpiece / Anchor)
  // Look for candidates that fit within the total session time (with room for at least 15m transition if not the only game)
  let mainCandidates = eligible.filter((g) => {
    if (!allowHeavy && isHeavy(g)) return false;
    const duration = getDuration(g);
    return duration <= totalMinutes + 15;
  });

  // If session is long (>= 90m) and substantial games (>= 45m or weight >= 2.0) are available,
  // enforce that the Main Game must be substantial so that a 15-30m micro filler isn't crowned
  // as the "Main Game" when meaty games are available.
  if (totalMinutes >= 90) {
    const substantial = mainCandidates.filter((g) => getDuration(g) >= 45 || (g.weight ?? 0) >= 2.0);
    if (substantial.length > 0) {
      mainCandidates = substantial;
    }
  }

  if (mainCandidates.length > 0) {
    const candidateIds = mainCandidates.map((g) => g.bggId);
    const mainId = chooseWeightedGameId(candidateIds, weightsMap, undefined, random);
    const mainGame = mainCandidates.find((g) => g.bggId === mainId)!;
    const mainDuration = getDuration(mainGame);
    const mainWeight = mainGame.weight ?? 2.0;

    hasHeavyGame = isHeavy(mainGame);
    pickedIds.add(mainId);
    remainingMinutes -= mainDuration;

    selectedLineup.push({
      role: "main",
      label: hasHeavyGame ? "👑 Plato Fuerte (Juego Pesado)" : "🎯 Juego Principal",
      game: mainGame,
      estimatedMinutes: mainDuration,
    });

    // 2. Anti-fatigue & Hierarchy Filler Selection
    // Each additional game requires its duration + TRANSITION_BUFFER_MINUTES (15m buffer)
    // Anti-fatigue & Hierarchy rules:
    // - Warm-up: strictly <= 35 min, weight <= 2.2, duration <= mainDuration, weight <= mainWeight.
    // - Cooldown: strictly <= 45 min, duration <= mainDuration.
    //   If Main was heavy, weight <= 2.0. Otherwise weight <= 2.4 and <= mainWeight.
    // - Never more than 3 games per session.
    while (remainingMinutes >= (15 + TRANSITION_BUFFER_MINUTES) && selectedLineup.length < 3) {
      const hasWarmup = selectedLineup.some((s) => s.role === "warmup");
      const hasCooldown = selectedLineup.some((s) => s.role === "cooldown");

      const fillerCandidates = eligible.filter((g) => {
        if (pickedIds.has(g.bggId)) return false;
        if (isHeavy(g)) return false; // Never a second heavy game

        const duration = getDuration(g);
        const weight = g.weight ?? 2.0;

        // Needs to fit in remaining time including transition buffer (with 15m grace)
        if (duration + TRANSITION_BUFFER_MINUTES > remainingMinutes + 15) return false;

        // Warm-up eligibility (quick opener)
        const canBeWarmup =
          !hasWarmup &&
          duration <= 35 &&
          duration <= mainDuration &&
          isLight(g) &&
          weight <= mainWeight;

        // Cooldown eligibility (wind-down closer)
        const canBeCooldown =
          !hasCooldown &&
          duration <= 45 &&
          duration <= mainDuration &&
          (hasHeavyGame ? weight <= 2.0 : weight <= 2.4 && weight <= mainWeight);

        return canBeWarmup || canBeCooldown;
      });

      if (fillerCandidates.length === 0) break;

      const fillerIds = fillerCandidates.map((g) => g.bggId);
      const chosenId = chooseWeightedGameId(fillerIds, weightsMap, undefined, random);
      const fillerGame = fillerCandidates.find((g) => g.bggId === chosenId)!;
      const duration = getDuration(fillerGame);
      const weight = fillerGame.weight ?? 2.0;

      pickedIds.add(chosenId);
      remainingMinutes -= (duration + TRANSITION_BUFFER_MINUTES);

      const canBeWarmup =
        !hasWarmup &&
        duration <= 35 &&
        duration <= mainDuration &&
        isLight(fillerGame) &&
        weight <= mainWeight;

      // Assign role: prefer warmup first if not present, otherwise cooldown
      if (canBeWarmup && !hasWarmup) {
        selectedLineup.unshift({
          role: "warmup",
          label: "🍕 Warm-up / Apertura",
          game: fillerGame,
          estimatedMinutes: duration,
        });
      } else {
        selectedLineup.push({
          role: "cooldown",
          label: "☕ Cooldown / Despedida",
          game: fillerGame,
          estimatedMinutes: duration,
        });
      }
    }
  }

  const gameMinutes = selectedLineup.reduce((sum, slot) => sum + slot.estimatedMinutes, 0);
  const transitions = Math.max(0, selectedLineup.length - 1);
  const transitionMinutes = transitions * TRANSITION_BUFFER_MINUTES;
  const totalEstimated = gameMinutes + transitionMinutes;

  return {
    status: selectedLineup.length > 0 ? "success" : "no_match",
    lineup: selectedLineup,
    totalEstimatedMinutes: totalEstimated,
    transitionMinutes,
    targetMinutes: totalMinutes,
    hasHeavy: hasHeavyGame,
  };
}
