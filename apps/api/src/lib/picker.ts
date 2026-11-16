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

function hasAnyKeyword(items: string[] | undefined, keywords: string[]): boolean {
  if (!items || items.length === 0) return false;
  return keywords.some((k) =>
    items.some((i) => i.toLowerCase().includes(k.toLowerCase()))
  );
}

export interface MenuRecipe {
  id: string;
  titlePrefix: string;
  styleBadge: string;
  description: string;
  isViable: (games: GroupGame[], allowHeavy: boolean) => boolean;
  getWeightsAndOptions: (
    games: GroupGame[],
    baseWeights: Map<number, number>,
  ) => {
    allowHeavy?: boolean;
    weightsMap: Map<number, number>;
    mechanicsAffinity?: number;
  };
}

export const MENU_RECIPES: MenuRecipe[] = [
  {
    id: "epic_strategy",
    titlePrefix: "Epic & Heavy Strategy",
    styleBadge: "🔴 Heavy Strategy",
    description: "Centerpiece heavyweight strategy game with dedicated setup and mental reset buffers.",
    isViable: (games, allowHeavy) =>
      allowHeavy && games.some((g) => (g.weight ?? 0) >= 2.8 || (g.playingTime ?? 0) >= 90),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const w = g.weight ?? 2.0;
        const time = g.playingTime ?? 45;
        if (w >= 2.8 || time >= 90) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 2 + (w >= 3.2 ? 60 : 35));
        } else {
          wMap.set(g.bggId, Math.max(0.1, (wMap.get(g.bggId) ?? 1) * 0.2));
        }
      }
      return { allowHeavy: true, weightsMap: wMap, mechanicsAffinity: 0 };
    },
  },
  {
    id: "high_interaction",
    titlePrefix: "High Interaction & Table Talk",
    styleBadge: "⚡ High Interaction",
    description: "Fast-paced bluffing, table talk, and direct interaction for an energetic gathering.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.mechanics, [
            "social deduction",
            "bluffing",
            "negotiation",
            "voting",
            "trading",
            "traitor",
            "hidden roles",
            "take that",
          ]) ||
          hasAnyKeyword(g.categories, ["bluffing", "party game", "deduction"]) ||
          (g.weight ?? 2.0) <= 2.5
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isInteractive =
          hasAnyKeyword(g.mechanics, [
            "social deduction",
            "bluffing",
            "negotiation",
            "voting",
            "trading",
            "traitor",
            "hidden roles",
            "take that",
          ]) || hasAnyKeyword(g.categories, ["bluffing", "party game", "deduction"]);
        const w = g.weight ?? 2.0;
        if (isInteractive) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 30);
        } else if (w <= 2.4) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 2 + 10);
        } else {
          wMap.set(g.bggId, Math.max(0.1, (wMap.get(g.bggId) ?? 1) * 0.3));
        }
      }
      return { allowHeavy: false, weightsMap: wMap, mechanicsAffinity: -0.4 };
    },
  },
  {
    id: "group_favorites",
    titlePrefix: "Table Favorites & Wishlist",
    styleBadge: "⭐ Group Wishlist Favorites",
    description: "Showcases the titles with the highest collective want-to-play votes from confirmed attendees.",
    isViable: (games) => games.length > 0,
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const [id, pts] of baseWeights.entries()) {
        wMap.set(id, pts * 3);
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.5 };
    },
  },
  {
    id: "engine_optimization",
    titlePrefix: "Engine Building & Optimization",
    styleBadge: "🧩 Engine & Optimization",
    description: "Satisfying efficiency puzzles, engine-building combos, and strategic board placement.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.mechanics, [
            "engine building",
            "card drafting",
            "drafting",
            "tile placement",
            "tableau building",
            "hand management",
            "set collection",
            "deck building",
          ]) || hasAnyKeyword(g.categories, ["economic", "puzzle", "animals"])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isEngine =
          hasAnyKeyword(g.mechanics, [
            "engine building",
            "card drafting",
            "drafting",
            "tile placement",
            "tableau building",
            "hand management",
            "set collection",
            "deck building",
          ]) || hasAnyKeyword(g.categories, ["economic", "puzzle", "animals"]);
        if (isEngine) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 30);
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.5 };
    },
  },
  {
    id: "thematic_adventure",
    titlePrefix: "Thematic & Narrative Immersion",
    styleBadge: "🗺️ Thematic Adventure",
    description: "High-stakes narrative immersion, cooperative survival, or epic tabletop quests.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.categories, [
            "thematic",
            "adventure",
            "miniatures",
            "fighting",
            "science fiction",
            "fantasy",
            "horror",
            "exploration",
          ]) ||
          hasAnyKeyword(g.mechanics, [
            "cooperative game",
            "campaign",
            "role playing",
            "dice rolling",
            "grid movement",
            "modular board",
          ])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isThematic =
          hasAnyKeyword(g.categories, [
            "thematic",
            "adventure",
            "miniatures",
            "fighting",
            "science fiction",
            "fantasy",
            "horror",
            "exploration",
          ]) ||
          hasAnyKeyword(g.mechanics, [
            "cooperative game",
            "campaign",
            "role playing",
            "dice rolling",
            "grid movement",
            "modular board",
          ]);
        if (isThematic) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 30);
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.3 };
    },
  },
  {
    id: "accessible_classics",
    titlePrefix: "Accessible & Breezy Classics",
    styleBadge: "🎲 Accessible & Breezy",
    description: "Smooth, easy-to-table modern classics that maximize play time and minimize rules friction.",
    isViable: (games) => games.some((g) => (g.weight ?? 2.0) <= 2.4 && (g.playingTime ?? 45) <= 65),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const w = g.weight ?? 2.0;
        const time = g.playingTime ?? 45;
        if (w <= 2.4 && time <= 60) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 30);
        } else {
          wMap.set(g.bggId, Math.max(0.1, (wMap.get(g.bggId) ?? 1) * 0.2));
        }
      }
      return { allowHeavy: false, weightsMap: wMap, mechanicsAffinity: 0 };
    },
  },
];

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

  // Find eligible candidate pool
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

  // Determine which recipes are viable in this collection and headcount
  const viableRecipes = MENU_RECIPES.filter((r) => r.isViable(eligible, allowHeavy));

  // Pseudo-shuffle recipes deterministically or randomly to provide fresh options on reroll
  const recipePool = viableRecipes.length >= 3 ? [...viableRecipes] : [...MENU_RECIPES];
  const sortedRecipes = [...recipePool].sort((a, b) => {
    // If random returns deterministic value, use it, or default comparison
    const randA = Math.sin(a.id.length * 997 + (random() * 100));
    const randB = Math.sin(b.id.length * 997 + (random() * 100));
    return randA - randB;
  });

  const chosenRecipes: MenuRecipe[] = [];
  for (const rec of sortedRecipes) {
    if (!chosenRecipes.some((c) => c.id === rec.id)) {
      chosenRecipes.push(rec);
    }
    if (chosenRecipes.length === 3) break;
  }

  // Ensure we always have 3 recipes
  while (chosenRecipes.length < 3) {
    const fallback = MENU_RECIPES[chosenRecipes.length]!;
    chosenRecipes.push(fallback);
  }

  const optionLabels: ("A" | "B" | "C")[] = ["A", "B", "C"];
  const accumulatedExcludedAnchorIds = [...excludeBggIds];
  const resultOptions: EventMenuOption[] = [];

  for (let i = 0; i < 3; i++) {
    const recipe = chosenRecipes[i]!;
    const label = optionLabels[i]!;
    const { weightsMap: recipeWeights, mechanicsAffinity, allowHeavy: recipeAllowHeavy } =
      recipe.getWeightsAndOptions(eligible, weightsMap);

    const lineupResult = planSessionLineup(availableGames, {
      ...options,
      allowHeavy: recipeAllowHeavy !== undefined ? recipeAllowHeavy : allowHeavy,
      weightsMap: recipeWeights,
      excludeBggIds: accumulatedExcludedAnchorIds,
      mechanicsAffinity: mechanicsAffinity ?? 0,
      random,
    });

    const resolvedLineup =
      lineupResult.status === "success" && lineupResult.lineup.length > 0
        ? lineupResult
        : planSessionLineup(availableGames, {
            ...options,
            weightsMap: recipeWeights,
            random,
          });

    const mainGame = resolvedLineup.lineup.find((s) => s.role === "main")?.game;
    if (mainGame && eligible.length > i + 1) {
      accumulatedExcludedAnchorIds.push(mainGame.bggId);
    }

    resultOptions.push({
      id: label,
      title: `Option ${label}: ${recipe.titlePrefix}`,
      styleBadge: recipe.styleBadge,
      description: recipe.description,
      lineup: resolvedLineup.lineup,
      totalEstimatedMinutes: resolvedLineup.totalEstimatedMinutes,
      transitionMinutes: resolvedLineup.transitionMinutes ?? 0,
      hasHeavy: resolvedLineup.hasHeavy,
      themeNotice: resolvedLineup.themeNotice,
      votes: [],
    });
  }

  return {
    status: "success",
    options: resultOptions,
  };
}
