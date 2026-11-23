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

export function getGameTransition(
  game: GroupGame,
  customWeight?: number | null,
  customDuration?: number | null
): TransitionDetail {
  const duration = customDuration ?? game.playingTime ?? 60;
  const weight = customWeight ?? game.weight ?? 2.0;

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

export interface PlayableGameVariant {
  game: GroupGame;
  expansions: { bggId: number; name: string }[];
  duration: number;
  weight: number;
  mechanics: string[];
  addedMechanics: string[];
  isHeavy: boolean;
  isLight: boolean;
}

export function buildGameVariants(game: GroupGame, playerCount: number): PlayableGameVariant[] {
  const baseMax = game.maxPlayers ?? 4;
  const attached = game.expansions ?? [];

  // If playerCount exceeds base game capacity:
  if (playerCount > baseMax) {
    const playerExtensions = attached.filter((e) => (e.maxPlayers ?? 0) >= playerCount);
    if (playerExtensions.length === 0) return [];

    const extension = playerExtensions[0]!;
    const extraDuration = extension.playingTime ? Math.min(extension.playingTime, 45) : 20;
    const effectiveWeight = Math.max(game.weight ?? 2.0, extension.weight ?? game.weight ?? 2.0);
    const addedMechanics = (extension.mechanics ?? []).filter((m) => !(game.mechanics ?? []).includes(m));

    const variants: PlayableGameVariant[] = [
      {
        game,
        expansions: [{ bggId: extension.bggId, name: extension.name }],
        duration: (game.playingTime ?? 45) + extraDuration,
        weight: effectiveWeight,
        mechanics: [...(game.mechanics ?? []), ...addedMechanics],
        addedMechanics,
        isHeavy: effectiveWeight > 3.2,
        isLight: effectiveWeight <= 2.2,
      },
    ];

    // Optional content expansions combined with player extension
    const contentExpansions = attached.filter((e) => e.bggId !== extension.bggId);
    for (const ce of contentExpansions) {
      const combinedExtraTime = extraDuration + (ce.playingTime ? Math.min(ce.playingTime, 45) : 25);
      const combinedWeight = Math.max(effectiveWeight, ce.weight ?? effectiveWeight);
      const combinedAdded = [
        ...addedMechanics,
        ...(ce.mechanics ?? []).filter((m) => !(game.mechanics ?? []).includes(m) && !addedMechanics.includes(m)),
      ];
      variants.push({
        game,
        expansions: [
          { bggId: extension.bggId, name: extension.name },
          { bggId: ce.bggId, name: ce.name },
        ],
        duration: (game.playingTime ?? 45) + combinedExtraTime,
        weight: combinedWeight,
        mechanics: [...(game.mechanics ?? []), ...combinedAdded],
        addedMechanics: combinedAdded,
        isHeavy: combinedWeight > 3.2,
        isLight: combinedWeight <= 2.2,
      });
    }

    return variants;
  }

  // If player count is supported by the base game directly:
  const baseWeight = game.weight ?? 2.0;
  const baseDuration = game.playingTime ?? 45;
  const baseMechanics = game.mechanics ?? [];

  // 1. Vanilla (Juego base sin expansiones)
  const variants: PlayableGameVariant[] = [
    {
      game,
      expansions: [],
      duration: baseDuration,
      weight: baseWeight,
      mechanics: baseMechanics,
      addedMechanics: [],
      isHeavy: baseWeight > 3.2,
      isLight: baseWeight <= 2.2,
    },
  ];

  // 2. Individual content expansions
  const contentExpansions = attached.filter((e) => {
    // If it only expands players past baseMax and adds no mechanics or weight, skip for <= baseMax
    if ((e.maxPlayers ?? 0) > baseMax && (!e.mechanics || e.mechanics.length === 0) && (!e.weight || e.weight <= baseWeight)) {
      return false;
    }
    return true;
  });

  for (const exp of contentExpansions) {
    const extraTime = exp.playingTime ? Math.min(exp.playingTime, 45) : 30;
    const expWeight = Math.max(baseWeight, exp.weight ?? baseWeight);
    const added = (exp.mechanics ?? []).filter((m) => !baseMechanics.includes(m));

    variants.push({
      game,
      expansions: [{ bggId: exp.bggId, name: exp.name }],
      duration: baseDuration + extraTime,
      weight: expWeight,
      mechanics: [...baseMechanics, ...added],
      addedMechanics: added,
      isHeavy: expWeight > 3.2,
      isLight: expWeight <= 2.2,
    });
  }

  return variants;
}

export function selectVariantForSlot(
  game: GroupGame,
  playerCount: number,
  options: {
    role: "main" | "warmup" | "cooldown";
    maxDuration: number;
    allowHeavy?: boolean;
    requireLight?: boolean;
    maxWeight?: number;
    recipeId?: string;
    themeCategory?: string;
    random?: () => number;
  }
): PlayableGameVariant | null {
  const variants = buildGameVariants(game, playerCount);
  if (variants.length === 0) return null;

  // Filter variants fitting constraints
  const fitting = variants.filter((v) => {
    if (v.duration > options.maxDuration) return false;
    if (options.allowHeavy === false && v.isHeavy) return false;
    if (options.requireLight && !v.isLight) return false;
    if (options.maxWeight !== undefined && v.weight > options.maxWeight) return false;
    return true;
  });

  if (fitting.length === 0) return null;
  if (fitting.length === 1) return fitting[0]!;

  const rnd = options.random ?? Math.random;

  // If explicit recipe prefers heavy/complex (e.g. Brain burner)
  if (options.recipeId === "heavy_euro_brainburner" || options.recipeId === "epic_strategy") {
    return [...fitting].sort((a, b) => b.weight - a.weight)[0]!;
  }

  // If explicit recipe prefers accessible/gateway or this is warmup/cooldown
  if (options.recipeId === "accessible_classics" || options.role === "warmup" || options.role === "cooldown") {
    return [...fitting].sort((a, b) => a.weight - b.weight)[0]!;
  }

  // If a theme was requested
  if (options.themeCategory) {
    const themed = fitting.filter(
      (v) =>
        hasAnyKeyword(v.mechanics, [options.themeCategory!]) ||
        hasAnyKeyword(game.categories, [options.themeCategory!])
    );
    if (themed.length > 0) {
      const withAdded = themed.find((v) => hasAnyKeyword(v.addedMechanics, [options.themeCategory!]));
      if (withAdded) return withAdded;
      return themed[Math.floor(rnd() * themed.length)]!;
    }
  }

  // Uniform sampling between vanilla and with-expansion
  return fitting[Math.floor(rnd() * fitting.length)]!;
}

export const TRANSITION_BUFFER_MINUTES = 15;

export interface LineupPlannerOptions {
  playerCount: number;
  totalMinutes: number;
  allowHeavy?: boolean;
  weightsMap?: Map<number, number>;
  excludeBggIds?: number[];
  mechanicsAffinity?: number;
  themeCategory?: string;
  recipeId?: string;
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
    themeCategory,
    recipeId,
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

  const RECIPE_ALIAS_MAP: Record<string, string> = {
    cooperative_survival: "cooperative_challenge",
    engine_building: "engine_combos",
    social_deduction: "high_interaction",
    party_mayhem: "party_and_push",
    thematic_narrative: "thematic_adventure",
    table_favorites: "group_favorites",
    accessible_gateway: "accessible_classics",
    cooperative_challenge: "cooperative_survival",
    engine_combos: "engine_building",
    high_interaction: "social_deduction",
    party_and_push: "party_mayhem",
    thematic_adventure: "thematic_narrative",
    group_favorites: "table_favorites",
    accessible_classics: "accessible_gateway",
  };

  // Check if an explicit recipe template was requested
  const explicitRecipe = recipeId
    ? MENU_RECIPES.find(
        (r) =>
          r.id === recipeId ||
          r.id === RECIPE_ALIAS_MAP[recipeId] ||
          RECIPE_ALIAS_MAP[r.id] === recipeId
      )
    : undefined;
  let effectiveAllowHeavy = allowHeavy;
  let effectiveMechanicsAffinity = mechanicsAffinity;
  let activeWeightsMap = new Map(weightsMap);

  if (explicitRecipe) {
    const recipeConfig = explicitRecipe.getWeightsAndOptions(eligible, activeWeightsMap);
    activeWeightsMap = recipeConfig.weightsMap;
    if (recipeConfig.allowHeavy !== undefined) {
      effectiveAllowHeavy = recipeConfig.allowHeavy;
    }
    if (recipeConfig.mechanicsAffinity !== undefined) {
      effectiveMechanicsAffinity = recipeConfig.mechanicsAffinity;
    }
  }

  // Helper classification
  const isHeavy = (g: GroupGame) => (g.weight ?? 0) > 3.2;
  const isLight = (g: GroupGame) => (g.weight ?? 2.0) <= 2.2;
  const getDuration = (g: GroupGame) => g.playingTime ?? 45;

  let remainingMinutes = totalMinutes;
  let hasHeavyGame = false;
  const selectedLineup: SessionGameSlot[] = [];
  const pickedIds = new Set<number>();

  const matchesTheme = (g: GroupGame) =>
    Boolean(
      themeCategory &&
        (hasAnyKeyword(g.categories, [themeCategory]) ||
          hasAnyKeyword(g.mechanics, [themeCategory]))
    );

  if (themeCategory) {
    const themedEligible = eligible.filter(matchesTheme);
    if (themedEligible.length > 0) {
      for (const g of eligible) {
        const curW = activeWeightsMap.get(g.bggId) ?? 1;
        if (matchesTheme(g)) {
          activeWeightsMap.set(g.bggId, curW * 4 + 40);
        } else {
          activeWeightsMap.set(g.bggId, Math.max(0.05, curW * 0.1));
        }
      }
    }
  }

  // 1. Choose Main Event (Centerpiece / Anchor)
  // Look for candidates and their best matching variants for this session
  const mainCandidateEntries = eligible
    .map((g) => {
      const variant = selectVariantForSlot(g, playerCount, {
        role: "main",
        maxDuration: totalMinutes + 15,
        allowHeavy: effectiveAllowHeavy,
        recipeId,
        themeCategory,
        random,
      });
      return variant ? { game: g, variant } : null;
    })
    .filter((e): e is { game: GroupGame; variant: PlayableGameVariant } => e !== null);

  let filteredMain = mainCandidateEntries;
  if (themeCategory) {
    const themed = filteredMain.filter(
      (e) => matchesTheme(e.game) || hasAnyKeyword(e.variant.mechanics, [themeCategory])
    );
    if (themed.length > 0) {
      filteredMain = themed;
    }
  }

  // If session is long (>= 90m) and substantial games (>= 45m or weight >= 2.0) are available,
  // enforce that the Main Game must be substantial so that a 15-30m micro filler isn't crowned
  // as the "Main Game" when meaty games are available.
  if (totalMinutes >= 90) {
    const substantial = filteredMain.filter((e) => e.variant.duration >= 45 || e.variant.weight >= 2.0);
    if (substantial.length > 0) {
      filteredMain = substantial;
    }
  }

  if (filteredMain.length > 0) {
    const candidateIds = filteredMain.map((e) => e.game.bggId);
    const mainId = chooseWeightedGameId(candidateIds, activeWeightsMap, undefined, random);
    const chosenEntry = filteredMain.find((e) => e.game.bggId === mainId)!;
    const mainGame = chosenEntry.game;
    const mainVariant = chosenEntry.variant;

    hasHeavyGame = mainVariant.isHeavy;
    pickedIds.add(mainId);
    remainingMinutes -= mainVariant.duration;

    selectedLineup.push({
      role: "main",
      label: hasHeavyGame ? "👑 Main Event (Heavy Game)" : "🎯 Main Event",
      game: mainGame,
      estimatedMinutes: mainVariant.duration,
      expansions: mainVariant.expansions,
      effectiveWeight: mainVariant.weight,
      addedMechanics: mainVariant.addedMechanics.length > 0 ? mainVariant.addedMechanics : undefined,
    });

    // 2. Anti-fatigue & Hierarchy Filler Selection
    // Dynamically scales setup & intermission buffer (15m to 30m) based on game complexity & duration
    while (remainingMinutes >= 20 && selectedLineup.length < 3) {
      const hasWarmup = selectedLineup.some((s) => s.role === "warmup");
      const hasCooldown = selectedLineup.some((s) => s.role === "cooldown");

      const fillerCandidatesWithVariants = eligible
        .filter((g) => !pickedIds.has(g.bggId))
        .map((g) => {
          const isCasualNight = mainVariant.isLight && mainVariant.duration <= 45;
          const warmupBuffer = getGameTransition(mainGame, mainVariant.weight, mainVariant.duration).minutes;

          const warmupVariant = !hasWarmup
            ? selectVariantForSlot(g, playerCount, {
                role: "warmup",
                maxDuration: Math.min(35, remainingMinutes + 15 - warmupBuffer),
                allowHeavy: false,
                requireLight: true,
                maxWeight: isCasualNight ? undefined : mainVariant.weight,
                recipeId,
                themeCategory,
                random,
              })
            : null;

          const cooldownBuffer = getGameTransition(g).minutes;
          const cooldownVariant = !hasCooldown
            ? selectVariantForSlot(g, playerCount, {
                role: "cooldown",
                maxDuration: Math.min(50, remainingMinutes + 15 - cooldownBuffer),
                allowHeavy: false,
                requireLight: hasHeavyGame,
                maxWeight: hasHeavyGame ? 2.0 : isCasualNight ? 2.4 : Math.min(2.4, mainVariant.weight),
                recipeId,
                themeCategory,
                random,
              })
            : null;

          const canBeWarmup = Boolean(
            warmupVariant &&
            warmupVariant.duration + warmupBuffer <= remainingMinutes + 15 &&
            (isCasualNight || (warmupVariant.duration <= mainVariant.duration && warmupVariant.weight <= mainVariant.weight))
          );

          const canBeCooldown = Boolean(
            cooldownVariant &&
            cooldownVariant.duration + cooldownBuffer <= remainingMinutes + 15 &&
            (isCasualNight || cooldownVariant.duration <= mainVariant.duration)
          );

          if (!canBeWarmup && !canBeCooldown) return null;

          return {
            game: g,
            canBeWarmup,
            warmupVariant,
            canBeCooldown,
            cooldownVariant,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      if (fillerCandidatesWithVariants.length === 0) break;

      // Adjust weights based on mechanics affinity relative to mainGame
      const fillerWeights = new Map<number, number>();
      const mainMechanics = new Set(mainVariant.mechanics);
      const mainCategories = new Set(mainGame.categories ?? []);

      for (const entry of fillerCandidatesWithVariants) {
        const g = entry.game;
        const baseW = activeWeightsMap.get(g.bggId) ?? 1;
        const sharedM = (g.mechanics ?? []).filter((m) => mainMechanics.has(m));
        const sharedC = (g.categories ?? []).filter((c) => mainCategories.has(c));
        const matchScore = sharedC.length * 2.5 + sharedM.length * 0.75;

        let multiplier = 1;
        if (effectiveMechanicsAffinity > 0) {
          multiplier = matchScore > 0
            ? 1 + effectiveMechanicsAffinity * (2 + matchScore * 1.5)
            : Math.max(0.15, 1 - effectiveMechanicsAffinity * 0.7);
        } else if (effectiveMechanicsAffinity < 0) {
          const diversityStrength = Math.abs(effectiveMechanicsAffinity);
          multiplier = matchScore === 0
            ? 1 + diversityStrength * 3
            : Math.max(0.1, 1 / (1 + diversityStrength * matchScore * 1.5));
        }

        fillerWeights.set(g.bggId, Math.max(0.1, baseW * multiplier));
      }

      const fillerIds = fillerCandidatesWithVariants.map((e) => e.game.bggId);
      const chosenId = chooseWeightedGameId(fillerIds, fillerWeights, undefined, random);
      const chosenEntry = fillerCandidatesWithVariants.find((e) => e.game.bggId === chosenId)!;
      const fillerGame = chosenEntry.game;

      const warmupBuffer = getGameTransition(mainGame, mainVariant.weight, mainVariant.duration).minutes;
      const sharedWithMain = (fillerGame.mechanics ?? []).filter((m) => mainMechanics.has(m));

      // Assign role: prefer warmup first if not present and eligible, otherwise cooldown
      if (chosenEntry.canBeWarmup && chosenEntry.warmupVariant && !hasWarmup) {
        const variant = chosenEntry.warmupVariant;
        pickedIds.add(chosenId);
        remainingMinutes -= (variant.duration + warmupBuffer);
        selectedLineup.unshift({
          role: "warmup",
          label: "🍕 Warm-up",
          game: fillerGame,
          estimatedMinutes: variant.duration,
          expansions: variant.expansions,
          effectiveWeight: variant.weight,
          addedMechanics: variant.addedMechanics.length > 0 ? variant.addedMechanics : undefined,
          sharedMechanics: sharedWithMain.length > 0 ? sharedWithMain : undefined,
        });
      } else if (chosenEntry.cooldownVariant) {
        const variant = chosenEntry.cooldownVariant;
        const cooldownBuffer = getGameTransition(fillerGame, variant.weight, variant.duration).minutes;
        pickedIds.add(chosenId);
        remainingMinutes -= (variant.duration + cooldownBuffer);
        selectedLineup.push({
          role: "cooldown",
          label: "☕ Cooldown",
          game: fillerGame,
          estimatedMinutes: variant.duration,
          expansions: variant.expansions,
          effectiveWeight: variant.weight,
          addedMechanics: variant.addedMechanics.length > 0 ? variant.addedMechanics : undefined,
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
      const transition = getGameTransition(slot.game, slot.effectiveWeight, slot.estimatedMinutes);
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
  if (themeCategory) {
    themeNotice = `🎭 Themed Night: ${themeCategory}`;
  } else if (selectedLineup.length > 1) {
    if (effectiveMechanicsAffinity > 0.2) {
      const mainSlot = selectedLineup.find((s) => s.role === "main");
      const mainCategories = new Set(mainSlot?.game.categories ?? []);
      const allSharedCategories = selectedLineup
        .filter((s) => s.role !== "main")
        .flatMap((s) => (s.game.categories ?? []).filter((c) => mainCategories.has(c)));
      const uniqueSharedCat = Array.from(new Set(allSharedCategories));
      if (uniqueSharedCat.length > 0) {
        themeNotice = `🎯 Themed Night: ${uniqueSharedCat.slice(0, 3).join(", ")}`;
      } else {
        const allShared = selectedLineup
          .filter((s) => s.role !== "main")
          .flatMap((s) => s.sharedMechanics ?? []);
        const uniqueShared = Array.from(new Set(allShared));
        if (uniqueShared.length > 0) {
          themeNotice = `🎯 Themed Night: features ${uniqueShared.slice(0, 3).join(", ")}`;
        } else {
          themeNotice = "🎯 Themed Night: aligned mechanics & style";
        }
      }
    } else if (effectiveMechanicsAffinity < -0.2) {
      themeNotice = "🌈 Diverse Menu: contrasting mechanics to prevent mental fatigue";
    }
  }

  // Detect matching template/recipe if not explicitly set
  const mainGame = selectedLineup.find((s) => s.role === "main")?.game;
  const detectedRecipe = (!explicitRecipe && mainGame)
    ? MENU_RECIPES.find((r) => {
        if (r.id === "wildcard_random" || r.id === "table_favorites") return false;
        return r.isViable([mainGame], effectiveAllowHeavy);
      })
    : undefined;

  const finalRecipe = explicitRecipe || detectedRecipe;

  return {
    status: selectedLineup.length > 0 ? "success" : "no_match",
    lineup: selectedLineup,
    totalEstimatedMinutes: totalEstimated,
    transitionMinutes,
    targetMinutes: totalMinutes,
    hasHeavy: hasHeavyGame,
    themeNotice,
    recipeId: finalRecipe?.id,
    recipeTitle: finalRecipe?.titlePrefix,
    recipeBadge: finalRecipe?.styleBadge,
    recipeDescription: finalRecipe?.description,
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
  category: "heavy" | "social" | "strategy" | "thematic" | "favorites" | "accessible" | "wildcard";
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
    id: "heavy_euro_brainburner",
    category: "heavy",
    titlePrefix: "Brain Burners & Heavy Euros",
    styleBadge: "🧠 Heavy Euro & Brain Burner",
    description: "Deep economic systems, worker placement, and complex optimization for players seeking heavy crunch.",
    isViable: (games, allowHeavy) =>
      allowHeavy &&
      games.some(
        (g) =>
          (g.weight ?? 0) >= 3.0 ||
          (hasAnyKeyword(g.mechanics, ["worker placement", "economic", "market"]) &&
            (g.weight ?? 0) >= 2.8)
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const w = g.weight ?? 2.0;
        const isEuro =
          hasAnyKeyword(g.mechanics, [
            "worker placement",
            "economic",
            "market",
            "income",
            "contracts",
          ]) || hasAnyKeyword(g.categories, ["economic", "industry / manufacturing"]);
        if (w >= 3.0) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 70);
        } else if (isEuro && w >= 2.6) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 2 + 40);
        } else {
          wMap.set(g.bggId, Math.max(0.1, (wMap.get(g.bggId) ?? 1) * 0.2));
        }
      }
      return { allowHeavy: true, weightsMap: wMap, mechanicsAffinity: 0.5 };
    },
  },
  {
    id: "epic_strategy",
    category: "heavy",
    titlePrefix: "Epic & Grand Strategy",
    styleBadge: "🔴 Heavy Strategy",
    description: "Centerpiece heavyweight strategy game with dedicated setup and mental reset transition buffers.",
    isViable: (games, allowHeavy) =>
      allowHeavy &&
      games.some(
        (g) =>
          (g.weight ?? 0) >= 3.1 ||
          ((g.playingTime ?? 0) >= 100 && (g.weight ?? 0) >= 2.8)
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const w = g.weight ?? 2.0;
        const time = g.playingTime ?? 45;
        if (w >= 3.1 || (time >= 100 && w >= 2.8)) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 2 + (w >= 3.2 ? 60 : 35));
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { allowHeavy: true, weightsMap: wMap, mechanicsAffinity: 0 };
    },
  },
  {
    id: "tactical_conflict",
    category: "strategy",
    titlePrefix: "Area Control & Tactical Combat",
    styleBadge: "⚔️ Area Control & Clashes",
    description: "Territorial struggle, tactical movement, and direct tabletop combat with high stakes.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.mechanics, [
            "area majority / influence",
            "area movement",
            "wargame",
            "take that",
            "conflict",
            "combat",
          ]) || hasAnyKeyword(g.categories, ["wargame", "miniatures", "fighting"])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isConflict =
          hasAnyKeyword(g.mechanics, [
            "area majority / influence",
            "area movement",
            "wargame",
            "take that",
            "conflict",
            "combat",
          ]) || hasAnyKeyword(g.categories, ["wargame", "miniatures", "fighting"]);
        if (isConflict) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 45);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.3 };
    },
  },
  {
    id: "cooperative_challenge",
    category: "thematic",
    titlePrefix: "Cooperative Survival & Teamwork",
    styleBadge: "🤝 Cooperative Teamwork",
    description: "All players unite to defeat the board, solve crises, and survive against escalating threats.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.mechanics, [
            "cooperative game",
            "communication limits",
            "traitor",
            "hidden roles",
          ]) || hasAnyKeyword(g.categories, ["cooperative"])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isCoop =
          hasAnyKeyword(g.mechanics, [
            "cooperative game",
            "communication limits",
            "traitor",
            "hidden roles",
          ]) || hasAnyKeyword(g.categories, ["cooperative"]);
        if (isCoop) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 40);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.4 };
    },
  },
  {
    id: "engine_combos",
    category: "strategy",
    titlePrefix: "Engine Building & Synergies",
    styleBadge: "⚙️ Engine & Combos",
    description: "Card drafting, tableau construction, and exponential resource production engines.",
    isViable: (games) =>
      games.some((g) =>
        hasAnyKeyword(g.mechanics, [
          "engine building",
          "tableau building",
          "deck building",
          "bag building",
          "pool building",
          "card drafting",
          "drafting",
          "resource management",
          "market",
          "income",
        ])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isEngine = hasAnyKeyword(g.mechanics, [
          "engine building",
          "tableau building",
          "deck building",
          "bag building",
          "pool building",
          "card drafting",
          "drafting",
          "resource management",
          "market",
          "income",
        ]);
        if (isEngine) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 35);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.5 };
    },
  },
  {
    id: "spatial_puzzle",
    category: "strategy",
    titlePrefix: "Tile Placement & Spatial Puzzles",
    styleBadge: "🧩 Spatial Puzzles & Tiles",
    description: "Satisfying pattern building, tile drafting, and tactile spatial optimization.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.mechanics, [
            "tile placement",
            "pattern building",
            "enclosure",
            "grid coverage",
            "square grid",
            "hexgrid",
          ]) || hasAnyKeyword(g.categories, ["puzzle", "abstract strategy"])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isSpatial =
          hasAnyKeyword(g.mechanics, [
            "tile placement",
            "pattern building",
            "enclosure",
            "grid coverage",
            "square grid",
            "hexgrid",
          ]) || hasAnyKeyword(g.categories, ["puzzle", "abstract strategy"]);
        if (isSpatial) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 35);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.4 };
    },
  },
  {
    id: "high_interaction",
    category: "social",
    titlePrefix: "Social Deduction & Table Talk",
    styleBadge: "⚡ High Interaction",
    description: "Fast-paced bluffing, secret roles, negotiation, and lively table conversation.",
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
          ]) ||
          hasAnyKeyword(g.categories, ["bluffing", "party game", "deduction"])
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
          ]) || hasAnyKeyword(g.categories, ["bluffing", "party game", "deduction"]);
        if (isInteractive) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 35);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { allowHeavy: false, weightsMap: wMap, mechanicsAffinity: -0.4 };
    },
  },
  {
    id: "party_and_push",
    category: "social",
    titlePrefix: "Party Mayhem & Push-Your-Luck",
    styleBadge: "🎉 Party & High Energy",
    description: "High energy, laughter, push-your-luck thrills, and quick turns for maximum group fun.",
    isViable: (games) =>
      games.some(
        (g) =>
          (g.weight ?? 2.0) <= 2.0 ||
          hasAnyKeyword(g.mechanics, [
            "push your luck",
            "speed matching",
            "dexterity",
            "acting",
            "betting",
            "real-time",
          ]) ||
          hasAnyKeyword(g.categories, ["party game", "humor"])
      ),
    getWeightsAndOptions: (games, baseWeights) => {
      const wMap = new Map(baseWeights);
      for (const g of games) {
        const isParty =
          hasAnyKeyword(g.mechanics, [
            "push your luck",
            "speed matching",
            "dexterity",
            "acting",
            "betting",
            "real-time",
          ]) || hasAnyKeyword(g.categories, ["party game", "humor"]);
        const w = g.weight ?? 2.0;
        if (isParty) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 40);
        } else if (w <= 1.8) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 2 + 20);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { allowHeavy: false, weightsMap: wMap, mechanicsAffinity: -0.3 };
    },
  },
  {
    id: "thematic_adventure",
    category: "thematic",
    titlePrefix: "Thematic & Narrative Worlds",
    styleBadge: "🗺️ Thematic Adventure",
    description: "High-stakes narrative immersion, rich fantasy/sci-fi worldbuilding, and tabletop quests.",
    isViable: (games) =>
      games.some(
        (g) =>
          hasAnyKeyword(g.categories, [
            "thematic",
            "adventure",
            "science fiction",
            "fantasy",
            "horror",
            "exploration",
            "fighting",
            "zombies",
            "murder/mystery",
            "mythology",
          ]) ||
          hasAnyKeyword(g.mechanics, [
            "campaign",
            "role playing",
            "storytelling",
            "scenario / mission / campaign game",
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
            "science fiction",
            "fantasy",
            "horror",
            "exploration",
            "fighting",
            "zombies",
            "murder/mystery",
            "mythology",
          ]) ||
          hasAnyKeyword(g.mechanics, [
            "campaign",
            "role playing",
            "storytelling",
            "scenario / mission / campaign game",
            "grid movement",
            "modular board",
          ]);
        if (isThematic) {
          wMap.set(g.bggId, (wMap.get(g.bggId) ?? 1) * 3 + 30);
        } else {
          wMap.set(g.bggId, Math.max(0.05, (wMap.get(g.bggId) ?? 1) * 0.15));
        }
      }
      return { weightsMap: wMap, mechanicsAffinity: 0.3 };
    },
  },
  {
    id: "group_favorites",
    category: "favorites",
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
    id: "accessible_classics",
    category: "accessible",
    titlePrefix: "Breezy Gateway & Modern Classics",
    styleBadge: "🎲 Accessible Classics",
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
  {
    id: "wildcard_random",
    category: "wildcard",
    titlePrefix: "Wildcard & Blind Draw",
    styleBadge: "🎲 Pure Random Wildcard",
    description: "No algorithms, curated formulas, or category bias—pure luck of the draw from your group's collection.",
    isViable: (games) => games.length > 0,
    getWeightsAndOptions: (games) => {
      const wMap = new Map<number, number>();
      for (const g of games) {
        wMap.set(g.bggId, 1);
      }
      return { weightsMap: wMap, mechanicsAffinity: 0 };
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

  // Fisher-Yates shuffle viable recipes deterministically using random()
  const shuffledPool = [...(viableRecipes.length >= 3 ? viableRecipes : MENU_RECIPES)];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = shuffledPool[i]!;
    shuffledPool[i] = shuffledPool[j]!;
    shuffledPool[j] = temp;
  }

  // Pick 3 recipes, striving for distinct macro-categories to guarantee contrasting flavors
  const chosenRecipes: MenuRecipe[] = [];
  const usedCategories = new Set<string>();

  // Pass 1: Try to pick from distinct macro-categories (e.g. Heavy vs Social vs Strategy)
  for (const rec of shuffledPool) {
    if (!usedCategories.has(rec.category)) {
      chosenRecipes.push(rec);
      usedCategories.add(rec.category);
    }
    if (chosenRecipes.length === 3) break;
  }

  // Pass 2: If collection is narrow, fill remaining slots from distinct recipes
  if (chosenRecipes.length < 3) {
    for (const rec of shuffledPool) {
      if (!chosenRecipes.some((c) => c.id === rec.id)) {
        chosenRecipes.push(rec);
      }
      if (chosenRecipes.length === 3) break;
    }
  }

  // Fallback if needed
  while (chosenRecipes.length < 3) {
    const fallback = MENU_RECIPES[chosenRecipes.length]!;
    chosenRecipes.push(fallback);
  }

  const optionLabels: ("A" | "B" | "C")[] = ["A", "B", "C"];
  const accumulatedExcludedAnchorIds = [...excludeBggIds];
  const accumulatedUsedGameIds = new Set<number>(excludeBggIds);
  const resultOptions: EventMenuOption[] = [];

  for (let i = 0; i < 3; i++) {
    const recipe = chosenRecipes[i]!;
    const label = optionLabels[i]!;
    const { weightsMap: recipeWeights, mechanicsAffinity, allowHeavy: recipeAllowHeavy } =
      recipe.getWeightsAndOptions(eligible, weightsMap);

    // Apply soft decay for all games already used in previous options in this trio
    for (const usedId of accumulatedUsedGameIds) {
      if (recipeWeights.has(usedId)) {
        recipeWeights.set(usedId, (recipeWeights.get(usedId) ?? 1) * 0.05);
      }
    }

    // Attempt to strictly exclude all previously used games to guarantee 0 repeats across options
    let lineupResult = planSessionLineup(availableGames, {
      ...options,
      allowHeavy: recipeAllowHeavy !== undefined ? recipeAllowHeavy : allowHeavy,
      weightsMap: recipeWeights,
      excludeBggIds: Array.from(accumulatedUsedGameIds),
      mechanicsAffinity: mechanicsAffinity ?? 0,
      random,
    });

    // If strictly excluding all used games left too few games to form a lineup,
    // or left a lone micro-filler that severely underfills a long gathering (>= 120m),
    // fallback to only excluding main game anchors, while keeping the soft decay on used fillers
    const isUnderfilled =
      lineupResult.status === "success" &&
      totalMinutes >= 120 &&
      lineupResult.lineup.length === 1 &&
      lineupResult.totalEstimatedMinutes <= 45 &&
      eligible.length > 2;

    if (lineupResult.status !== "success" || lineupResult.lineup.length === 0 || isUnderfilled) {
      lineupResult = planSessionLineup(availableGames, {
        ...options,
        allowHeavy: recipeAllowHeavy !== undefined ? recipeAllowHeavy : allowHeavy,
        weightsMap: recipeWeights,
        excludeBggIds: accumulatedExcludedAnchorIds,
        mechanicsAffinity: mechanicsAffinity ?? 0,
        random,
      });
    }

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
    for (const slot of resolvedLineup.lineup) {
      accumulatedUsedGameIds.add(slot.game.bggId);
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
