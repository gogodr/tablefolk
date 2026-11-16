import type {
  EventMenuOption,
  GameKind,
  GroupGame,
  SessionGameSlot,
  SessionLineupResult,
  SessionMenuTrioResult,
} from "@tablefolk/contracts";

export function pickIndex(count: number, random = Math.random): number {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be positive");
  return Math.floor(random() * count);
}

export interface CandidateGame {
  bggId: number;
  kind?: GameKind;
  baseGameBggId?: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  effectiveMaxPlayers?: number | null;
  playingTime?: number | null;
  weight?: number | null;
  isStandalone?: boolean | null;
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
      // Expansions cannot be drawn / picked independently UNLESS marked as standalone
      const isExpansion =
        game.kind === "boardgameexpansion" ||
        (game.baseGameBggId !== null && game.baseGameBggId !== undefined);
      if (isExpansion && !game.isStandalone) {
        return false;
      }

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
      const val = weights.get(id);
      return typeof val === "number" && Number.isFinite(val) && val > 0 ? val : 1;
    }
    const val = weights[id];
    return typeof val === "number" && Number.isFinite(val) && val > 0 ? val : 1;
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

export interface TransitionDetail {
  minutes: number;
  reason: string;
}

export function getGameTransition(game: GroupGame): TransitionDetail {
  const duration = game.playingTime ?? 60;
  const weight = game.weight ?? 2.0;

  // Heavy / Epic game (e.g. Rising Sun, Brass, Scythe, Terraforming Mars)
  if (weight >= 3.2 || duration >= 90) {
    return {
      minutes: 30,
      reason: "☕ 30m Setup & Rules Teach (Heavy game)",
    };
  }
  // Medium-Heavy game (e.g. Wingspan, Clank!, Catan with 5-6p expansion)
  if (weight >= 2.6 || duration >= 70) {
    return {
      minutes: 25,
      reason: "☕ 25m Table Setup & Rules Overview",
    };
  }
  // Medium standard game (e.g. Pandemic, Ticket to Ride, WoW: Lich King)
  if (weight >= 2.0 || duration >= 45) {
    return {
      minutes: 20,
      reason: "☕ 20m Intermission & Board Setup",
    };
  }
  // Light / filler game (e.g. Avalon, Sushi Go, Love Letter)
  return {
    minutes: 15,
    reason: "☕ 15m Quick Reset & Snack buffer",
  };
}

export const TRANSITION_BUFFER_MINUTES = 15;

export interface LineupPlannerOptions {
  playerCount: number;
  totalMinutes: number;
  allowHeavy?: boolean;
  weightsMap?: Map<number, number>;
  excludeBggIds?: number[];
  mechanicsAffinity?: number;
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
    mechanicsAffinity = 0,
    random = Math.random,
  } = options;

  // Filter games that support the playerCount (including expansion player counts)
  // Expansions cannot be chosen as standalone games in the lineup unless marked as isStandalone
  const eligible = availableGames.filter((g) => {
    const isExpansion =
      g.kind === "boardgameexpansion" ||
      (g.baseGameBggId !== null && g.baseGameBggId !== undefined);
    if (isExpansion && !g.isStandalone) {
      return false;
    }
    if (excludeBggIds.includes(g.bggId)) return false;
    const effectiveMax = g.effectiveMaxPlayers ?? g.maxPlayers;
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
      label: hasHeavyGame ? "👑 Main Event (Heavy Game)" : "🎯 Main Event",
      game: mainGame,
      estimatedMinutes: mainDuration,
    });

    // 2. Anti-fatigue & Hierarchy Filler Selection
    // Dynamically scales setup & intermission buffer (15m to 30m) based on game complexity & duration
    while (remainingMinutes >= 20 && selectedLineup.length < 3) {
      const hasWarmup = selectedLineup.some((s) => s.role === "warmup");
      const hasCooldown = selectedLineup.some((s) => s.role === "cooldown");

      const fillerCandidates = eligible.filter((g) => {
        if (pickedIds.has(g.bggId)) return false;
        if (isHeavy(g)) return false; // Never a second heavy game

        const duration = getDuration(g);
        const weight = g.weight ?? 2.0;

        // Transition buffer required before the next game:
        // - Warm-up is played before the Main Game, so the transition before Main Game depends on Main Game
        const warmupBuffer = getGameTransition(mainGame).minutes;
        // - Cooldown is played after the Main Game, so transition before Cooldown depends on Cooldown
        const cooldownBuffer = getGameTransition(g).minutes;

        // Warm-up eligibility (quick opener)
        const canBeWarmup =
          !hasWarmup &&
          duration <= 35 &&
          duration <= mainDuration &&
          isLight(g) &&
          weight <= mainWeight &&
          duration + warmupBuffer <= remainingMinutes + 15;

        // Cooldown eligibility (wind-down closer)
        const canBeCooldown =
          !hasCooldown &&
          duration <= 45 &&
          duration <= mainDuration &&
          (hasHeavyGame ? weight <= 2.0 : weight <= 2.4 && weight <= mainWeight) &&
          duration + cooldownBuffer <= remainingMinutes + 15;

        return canBeWarmup || canBeCooldown;
      });

      if (fillerCandidates.length === 0) break;

      // Adjust weights based on mechanics affinity relative to mainGame
      const fillerWeights = new Map<number, number>();
      const mainMechanics = new Set(mainGame.mechanics ?? []);
      const mainCategories = new Set(mainGame.categories ?? []);

      for (const g of fillerCandidates) {
        const baseW = weightsMap.get(g.bggId) ?? 1;
        const sharedM = (g.mechanics ?? []).filter((m) => mainMechanics.has(m));
        const sharedC = (g.categories ?? []).filter((c) => mainCategories.has(c));
        const matchScore = sharedM.length * 2 + sharedC.length * 0.5;

        let multiplier = 1;
        if (mechanicsAffinity > 0) {
          // Boost games that share mechanics / themes with Main Game
          multiplier = matchScore > 0
            ? 1 + mechanicsAffinity * (2 + matchScore * 1.5)
            : Math.max(0.15, 1 - mechanicsAffinity * 0.7);
        } else if (mechanicsAffinity < 0) {
          // Boost games that differ in mechanics / themes from Main Game
          const diversityStrength = Math.abs(mechanicsAffinity);
          multiplier = matchScore === 0
            ? 1 + diversityStrength * 3
            : Math.max(0.1, 1 / (1 + diversityStrength * matchScore * 1.5));
        }

        fillerWeights.set(g.bggId, Math.max(0.1, baseW * multiplier));
      }

      const fillerIds = fillerCandidates.map((g) => g.bggId);
      const chosenId = chooseWeightedGameId(fillerIds, fillerWeights, undefined, random);
      const fillerGame = fillerCandidates.find((g) => g.bggId === chosenId)!;
      const duration = getDuration(fillerGame);
      const weight = fillerGame.weight ?? 2.0;

      const warmupBuffer = getGameTransition(mainGame).minutes;
      const cooldownBuffer = getGameTransition(fillerGame).minutes;

      const canBeWarmup =
        !hasWarmup &&
        duration <= 35 &&
        duration <= mainDuration &&
        isLight(fillerGame) &&
        weight <= mainWeight &&
        duration + warmupBuffer <= remainingMinutes + 15;

      const sharedWithMain = (fillerGame.mechanics ?? []).filter((m) => mainMechanics.has(m));

      // Assign role: prefer warmup first if not present and eligible, otherwise cooldown
      if (canBeWarmup && !hasWarmup) {
        pickedIds.add(chosenId);
        remainingMinutes -= (duration + warmupBuffer);
        selectedLineup.unshift({
          role: "warmup",
          label: "🍕 Warm-up",
          game: fillerGame,
          estimatedMinutes: duration,
          sharedMechanics: sharedWithMain.length > 0 ? sharedWithMain : undefined,
        });
      } else {
        pickedIds.add(chosenId);
        remainingMinutes -= (duration + cooldownBuffer);
        selectedLineup.push({
          role: "cooldown",
          label: "☕ Cooldown",
          game: fillerGame,
          estimatedMinutes: duration,
          sharedMechanics: sharedWithMain.length > 0 ? sharedWithMain : undefined,
        });
      }
    }
  }

  // Populate dynamic transition details per slot
  for (let i = 0; i < selectedLineup.length; i++) {
    const slot = selectedLineup[i]!;
    if (i === 0) {
      slot.transitionBeforeMinutes = 0;
      slot.transitionReason = undefined;
    } else {
      const transition = getGameTransition(slot.game);
      slot.transitionBeforeMinutes = transition.minutes;
      slot.transitionReason = transition.reason;
    }
  }

  const gameMinutes = selectedLineup.reduce((sum, slot) => sum + slot.estimatedMinutes, 0);
  const transitionMinutes = selectedLineup.reduce(
    (sum, slot) => sum + (slot.transitionBeforeMinutes ?? 0),
    0
  );
  const totalEstimated = gameMinutes + transitionMinutes;

  let themeNotice: string | undefined;
  if (selectedLineup.length > 1) {
    if (mechanicsAffinity > 0.2) {
      const allShared = selectedLineup
        .filter((s) => s.role !== "main")
        .flatMap((s) => s.sharedMechanics ?? []);
      const uniqueShared = Array.from(new Set(allShared));
      if (uniqueShared.length > 0) {
        themeNotice = `🎯 Themed Night: features ${uniqueShared.slice(0, 3).join(", ")}`;
      } else {
        themeNotice = "🎯 Themed Night: aligned mechanics & style";
      }
    } else if (mechanicsAffinity < -0.2) {
      themeNotice = "🌈 Diverse Menu: contrasting mechanics to prevent mental fatigue";
    }
  }

  return {
    status: selectedLineup.length > 0 ? "success" : "no_match",
    lineup: selectedLineup,
    totalEstimatedMinutes: totalEstimated,
    transitionMinutes,
    targetMinutes: totalMinutes,
    hasHeavy: hasHeavyGame,
    themeNotice,
  };
}

export function planSessionMenuTrio(
  availableGames: GroupGame[],
  options: LineupPlannerOptions,
): SessionMenuTrioResult {
  const {
    playerCount,
    totalMinutes,
    allowHeavy = true,
    weightsMap = new Map<number, number>(),
    excludeBggIds = [],
    random = Math.random,
  } = options;

  // First verify if any game is eligible
  const baseLineup = planSessionLineup(availableGames, options);
  if (baseLineup.status !== "success" || baseLineup.lineup.length === 0) {
    return {
      status: baseLineup.status,
      options: [],
    };
  }

  // Find eligible candidate pool to understand available variety
  const eligible = availableGames.filter((g) => {
    const isExpansion =
      g.kind === "boardgameexpansion" ||
      (g.baseGameBggId !== null && g.baseGameBggId !== undefined);
    if (isExpansion && !g.isStandalone) return false;
    if (excludeBggIds.includes(g.bggId)) return false;
    const effectiveMax = g.effectiveMaxPlayers ?? g.maxPlayers;
    if (g.minPlayers === null || effectiveMax === null) return false;
    return playerCount >= g.minPlayers && playerCount <= effectiveMax;
  });

  // --- Option A: "Noche Épica / Estratégica" ---
  // Favor heavier / substantial games as main
  const optionAWeights = new Map(weightsMap);
  for (const g of eligible) {
    const w = g.weight ?? 2.0;
    const time = g.playingTime ?? 45;
    if (w >= 2.6 || time >= 60) {
      optionAWeights.set(g.bggId, (optionAWeights.get(g.bggId) ?? 1) * 2 + (w >= 3.0 ? 50 : 20));
    }
  }

  const lineupA = planSessionLineup(availableGames, {
    ...options,
    allowHeavy,
    weightsMap: optionAWeights,
    mechanicsAffinity: 0,
    random,
  });

  const mainAGame = lineupA.lineup.find((s) => s.role === "main")?.game;
  const mainABggId = mainAGame?.bggId;

  // --- Option B: "Dinámica & Interacción" ---
  // Exclude main A if there are enough eligible games, and bias towards lighter/social/dynamic games
  const excludeForB = [...excludeBggIds];
  if (mainABggId && eligible.length > 1) {
    excludeForB.push(mainABggId);
  }

  const optionBWeights = new Map(weightsMap);
  for (const g of eligible) {
    const w = g.weight ?? 2.0;
    if (w <= 2.5) {
      optionBWeights.set(g.bggId, (optionBWeights.get(g.bggId) ?? 1) * 2.2);
    } else {
      optionBWeights.set(g.bggId, Math.max(0.1, (optionBWeights.get(g.bggId) ?? 1) * 0.3));
    }
  }

  const lineupB = planSessionLineup(availableGames, {
    ...options,
    allowHeavy: false, // Option B is more dynamic/accessible
    weightsMap: optionBWeights,
    excludeBggIds: excludeForB,
    mechanicsAffinity: -0.4, // Diverse contrasting mechanics
    random,
  });

  const resolvedLineupB =
    lineupB.status === "success" && lineupB.lineup.length > 0
      ? lineupB
      : planSessionLineup(availableGames, { ...options, weightsMap: optionBWeights, random });

  const mainBGame = resolvedLineupB.lineup.find((s) => s.role === "main")?.game;
  const mainBBggId = mainBGame?.bggId;

  // --- Option C: "Favoritos de la Mesa" (Crowd-Pleasers / Wishlist points) ---
  // Exclude main A and main B if possible so we have 3 unique anchor games
  const excludeForC = [...excludeBggIds];
  if (mainABggId && eligible.length > 2) excludeForC.push(mainABggId);
  if (mainBBggId && eligible.length > 2) excludeForC.push(mainBBggId);

  const optionCWeights = new Map(weightsMap);
  for (const [id, pts] of weightsMap.entries()) {
    optionCWeights.set(id, pts * 2);
  }

  const lineupC = planSessionLineup(availableGames, {
    ...options,
    weightsMap: optionCWeights,
    excludeBggIds: excludeForC.length === excludeBggIds.length + 2 ? excludeForC : excludeBggIds,
    mechanicsAffinity: 0.5,
    random,
  });

  const resolvedLineupC =
    lineupC.status === "success" && lineupC.lineup.length > 0 ? lineupC : baseLineup;

  const resultOptions: EventMenuOption[] = [
    {
      id: "A",
      title: "Opción A: Noche Épica & Estrategia",
      styleBadge: lineupA.hasHeavy ? "🔴 Estrategia & Peso Alto" : "🧠 Noche Enfocada & Sesión Larga",
      description: "Centrado en un plato fuerte de peso con descansos calculados para evitar saturación.",
      lineup: lineupA.lineup,
      totalEstimatedMinutes: lineupA.totalEstimatedMinutes,
      transitionMinutes: lineupA.transitionMinutes ?? 0,
      hasHeavy: lineupA.hasHeavy,
      themeNotice: lineupA.themeNotice,
      votes: [],
    },
    {
      id: "B",
      title: "Opción B: Dinámica & Interacción",
      styleBadge: "⚡ Ritmo Ágil & Alta Charla",
      description: "Títulos directos, con interacción, farol y risas para una velada ágil y distendida.",
      lineup: resolvedLineupB.lineup,
      totalEstimatedMinutes: resolvedLineupB.totalEstimatedMinutes,
      transitionMinutes: resolvedLineupB.transitionMinutes ?? 0,
      hasHeavy: resolvedLineupB.hasHeavy,
      themeNotice: resolvedLineupB.themeNotice,
      votes: [],
    },
    {
      id: "C",
      title: "Opción C: Favoritos de la Mesa",
      styleBadge: "⭐ Los Más Votados por el Grupo",
      description: "Prioriza los juegos que tienen más puntos de deseo acumulados entre los asistentes.",
      lineup: resolvedLineupC.lineup,
      totalEstimatedMinutes: resolvedLineupC.totalEstimatedMinutes,
      transitionMinutes: resolvedLineupC.transitionMinutes ?? 0,
      hasHeavy: resolvedLineupC.hasHeavy,
      themeNotice: resolvedLineupC.themeNotice,
      votes: [],
    },
  ];

  return {
    status: "success",
    options: resultOptions,
  };
}
