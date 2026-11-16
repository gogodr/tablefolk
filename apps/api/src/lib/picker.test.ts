import { describe, expect, it } from "vitest";
import {
  chooseGameId,
  chooseWeightedGameId,
  eligibleGameIds,
  planSessionLineup,
  planSessionMenuTrio,
  MENU_RECIPES,
} from "./picker.js";
import type { GroupGame } from "@tablefolk/contracts";

describe("game night picker", () => {
  const games = [
    { bggId: 42, minPlayers: 2, maxPlayers: 4, playingTime: 60, weight: 2.5 },
    { bggId: 42, minPlayers: 2, maxPlayers: 4, playingTime: 60, weight: 2.5 },
    { bggId: 17, minPlayers: 3, maxPlayers: 6, playingTime: 120, weight: 3.8 },
    { bggId: 99, minPlayers: null, maxPlayers: null },
    { bggId: 10, minPlayers: 2, maxPlayers: 5, playingTime: 30, weight: 1.5 },
  ];

  it("counts a multiply shared game once and includes player range endpoints", () => {
    expect(eligibleGameIds(games, 2)).toEqual([10, 42]);
    expect(eligibleGameIds(games, 4)).toEqual([10, 17, 42]);
    expect(eligibleGameIds(games, 6)).toEqual([17]);
  });

  it("supports expanded player counts via effectiveMaxPlayers from expansions", () => {
    const baseGameWithExpansion = [
      { bggId: 2653, minPlayers: 2, maxPlayers: 4, effectiveMaxPlayers: 6 },
    ];
    // Base game without expansion would be rejected for 6 players, but with expansion it is eligible
    expect(eligibleGameIds(baseGameWithExpansion, 4)).toEqual([2653]);
    expect(eligibleGameIds(baseGameWithExpansion, 6)).toEqual([2653]);
    expect(eligibleGameIds(baseGameWithExpansion, 7)).toEqual([]);
  });

  it("excludes standalone expansions from the pick pool while keeping the base game", () => {
    const gamesAndExpansions = [
      // Base game: Survive: Escape from Atlantis!
      {
        bggId: 2655,
        kind: "boardgame" as const,
        minPlayers: 2,
        maxPlayers: 4,
        effectiveMaxPlayers: 6,
      },
      // Expansion: Survive 5-6 Player Mini Expansion
      {
        bggId: 99991,
        kind: "boardgameexpansion" as const,
        baseGameBggId: 2655,
        minPlayers: 2,
        maxPlayers: 6,
      },
      // Base game: Rising Sun
      {
        bggId: 205896,
        kind: "boardgame" as const,
        minPlayers: 3,
        maxPlayers: 5,
      },
      // Expansion: Rising Sun: Daimyo Box
      {
        bggId: 99992,
        kind: "boardgameexpansion" as const,
        baseGameBggId: 205896,
        minPlayers: 3,
        maxPlayers: 5,
      },
    ];

    // For 5 players: Rising Sun and Survive (expanded) are eligible, but NEVER their expansions
    expect(eligibleGameIds(gamesAndExpansions, 5)).toEqual([2655, 205896]);

    // For 6 players: only Survive (expanded to 6) is eligible, neither expansion is in the pool
    expect(eligibleGameIds(gamesAndExpansions, 6)).toEqual([2655]);
  });

  it("allows expansions marked as isStandalone to be drawn independently", () => {
    const standaloneExpansion = [
      {
        bggId: 8888,
        kind: "boardgameexpansion" as const,
        baseGameBggId: 7777,
        minPlayers: 2,
        maxPlayers: 4,
        isStandalone: true,
      },
    ];

    expect(eligibleGameIds(standaloneExpansion, 4)).toEqual([8888]);
  });

  it("excludes games with unknown or incompatible player counts", () => {
    expect(eligibleGameIds(games, 7)).toEqual([]);
    expect(eligibleGameIds([{ bggId: 1, minPlayers: 5, maxPlayers: 2 }], 3)).toEqual([]);
  });

  it("filters by maximum duration when specified", () => {
    expect(eligibleGameIds(games, { playerCount: 4, maxDuration: 45 })).toEqual([10]);
    expect(eligibleGameIds(games, { playerCount: 4, maxDuration: 60 })).toEqual([10, 42]);
  });

  it("filters by maximum weight / complexity when specified", () => {
    expect(eligibleGameIds(games, { playerCount: 4, maxWeight: 2.0 })).toEqual([10]);
    expect(eligibleGameIds(games, { playerCount: 4, maxWeight: 3.0 })).toEqual([10, 42]);
  });

  it("picks a different game on reroll when one exists", () => {
    expect(chooseGameId([17, 42], 17, () => 0)).toBe(42);
    expect(chooseGameId([17], 17, () => 0)).toBe(17);
  });

  it("favors games with higher weights / interest votes in weighted selection", () => {
    const weights = { 17: 1, 42: 9 };
    expect(chooseWeightedGameId([17, 42], weights, undefined, () => 0.05)).toBe(17);
    expect(chooseWeightedGameId([17, 42], weights, undefined, () => 0.5)).toBe(42);
  });

  describe("planSessionLineup (Smart Lineup & Anti-fatigue)", () => {
    const sampleGroupGames: GroupGame[] = [
      {
        bggId: 1,
        name: "Brass: Birmingham",
        kind: "boardgame",
        minPlayers: 2,
        maxPlayers: 4,
        playingTime: 120,
        minPlayingTime: 60,
        maxPlayingTime: 120,
        weight: 3.9, // HEAVY
        yearPublished: 2018,
        description: null,
        minAge: 14,
        coverUrl: null,
        sourceUrl: "https://bgg.com/1",
        designers: [],
        publishers: [],
        categories: [],
        owners: [],
      },
      {
        bggId: 2,
        name: "Terraforming Mars",
        kind: "boardgame",
        minPlayers: 1,
        maxPlayers: 5,
        playingTime: 120,
        minPlayingTime: 90,
        maxPlayingTime: 120,
        weight: 3.7, // HEAVY
        yearPublished: 2016,
        description: null,
        minAge: 12,
        coverUrl: null,
        sourceUrl: "https://bgg.com/2",
        designers: [],
        publishers: [],
        categories: [],
        owners: [],
      },
      {
        bggId: 3,
        name: "Sushi Go!",
        kind: "boardgame",
        minPlayers: 2,
        maxPlayers: 5,
        playingTime: 20,
        minPlayingTime: 15,
        maxPlayingTime: 20,
        weight: 1.2, // LIGHT FILLER
        yearPublished: 2013,
        description: null,
        minAge: 8,
        coverUrl: null,
        sourceUrl: "https://bgg.com/3",
        designers: [],
        publishers: [],
        categories: [],
        owners: [],
      },
      {
        bggId: 4,
        name: "Codenames",
        kind: "boardgame",
        minPlayers: 2,
        maxPlayers: 8,
        playingTime: 15,
        minPlayingTime: 15,
        maxPlayingTime: 15,
        weight: 1.3, // LIGHT FILLER
        yearPublished: 2015,
        description: null,
        minAge: 10,
        coverUrl: null,
        sourceUrl: "https://bgg.com/4",
        designers: [],
        publishers: [],
        categories: [],
        owners: [],
      },
    ];

    it("enforces the anti-fatigue rule: never selects two heavy games in one session", () => {
      // 4 hours session with 4 players
      const result = planSessionLineup(sampleGroupGames, {
        playerCount: 4,
        totalMinutes: 240,
        allowHeavy: true,
      });

      expect(result.status).toBe("success");
      const heavyGames = result.lineup.filter((s) => (s.game.weight ?? 0) > 3.2);
      expect(heavyGames.length).toBeLessThanOrEqual(1); // Anti-fatigue rule verified!
    });

    it("pairs a heavy game with light warmup/cooldown fillers within time budget", () => {
      const result = planSessionLineup(sampleGroupGames, {
        playerCount: 4,
        totalMinutes: 180,
        allowHeavy: true,
      });

      expect(result.status).toBe("success");
      expect(result.totalEstimatedMinutes).toBeLessThanOrEqual(180 + 20);
      expect(result.lineup.length).toBeGreaterThanOrEqual(2);
      expect(result.transitionMinutes).toBeGreaterThan(0);
    });

    it("ensures warm-up is never longer or heavier than the main game (hierarchy rule)", () => {
      const hierarchyGames: GroupGame[] = [
        {
          bggId: 101,
          name: "World of Warcraft: Wrath of the Lich King",
          kind: "boardgame",
          minPlayers: 1,
          maxPlayers: 5,
          playingTime: 60,
          minPlayingTime: 60,
          maxPlayingTime: 60,
          weight: 2.3, // Medium
          yearPublished: 2021,
          description: null,
          minAge: 14,
          coverUrl: null,
          sourceUrl: "https://bgg.com/101",
          designers: [],
          publishers: [],
          categories: [],
          owners: [],
        },
        {
          bggId: 102,
          name: "The Resistance: Avalon",
          kind: "boardgame",
          minPlayers: 5,
          maxPlayers: 10,
          playingTime: 30,
          minPlayingTime: 30,
          maxPlayingTime: 30,
          weight: 1.7, // Light filler
          yearPublished: 2012,
          description: null,
          minAge: 13,
          coverUrl: null,
          sourceUrl: "https://bgg.com/102",
          designers: [],
          publishers: [],
          categories: [],
          owners: [],
        },
      ];

      const result = planSessionLineup(hierarchyGames, {
        playerCount: 5,
        totalMinutes: 180,
      });

      expect(result.status).toBe("success");
      const mainSlot = result.lineup.find((s) => s.role === "main");
      const warmupSlot = result.lineup.find((s) => s.role === "warmup");

      expect(mainSlot).toBeDefined();
      expect(mainSlot!.game.bggId).toBe(101); // WoW is the substantial Main Game!

      if (warmupSlot) {
        expect(warmupSlot.game.bggId).toBe(102); // Avalon is Warm-up, NOT WoW!
        expect(warmupSlot.estimatedMinutes).toBeLessThanOrEqual(mainSlot!.estimatedMinutes);
        expect(warmupSlot.game.weight ?? 0).toBeLessThanOrEqual(mainSlot!.game.weight ?? 5);
      }
    });

    it("calculates dynamic transition dead time based on game complexity & duration (e.g. 30m for Rising Sun)", () => {
      const risingSunAndFillers: GroupGame[] = [
        {
          bggId: 201,
          name: "Rising Sun",
          kind: "boardgame",
          minPlayers: 3,
          maxPlayers: 5,
          playingTime: 120,
          minPlayingTime: 90,
          maxPlayingTime: 120,
          weight: 3.3, // Heavy epic game
          yearPublished: 2018,
          description: null,
          minAge: 14,
          coverUrl: null,
          sourceUrl: "https://bgg.com/201",
          designers: [],
          publishers: [],
          categories: [],
          owners: [],
        },
        {
          bggId: 202,
          name: "Sushi Go!",
          kind: "boardgame",
          minPlayers: 2,
          maxPlayers: 5,
          playingTime: 20,
          minPlayingTime: 15,
          maxPlayingTime: 20,
          weight: 1.2, // Light filler
          yearPublished: 2013,
          description: null,
          minAge: 8,
          coverUrl: null,
          sourceUrl: "https://bgg.com/202",
          designers: [],
          publishers: [],
          categories: [],
          owners: [],
        },
      ];

      const result = planSessionLineup(risingSunAndFillers, {
        playerCount: 4,
        totalMinutes: 180,
      });

      expect(result.status).toBe("success");
      expect(result.lineup.length).toBe(2);

      // Warm-up is Sushi Go!, Main is Rising Sun
      const risingSunSlot = result.lineup.find((s) => s.game.bggId === 201);
      expect(risingSunSlot).toBeDefined();
      expect(risingSunSlot!.transitionBeforeMinutes).toBe(30); // 30 min buffer for Rising Sun!
      expect(result.transitionMinutes).toBe(30);
      expect(result.totalEstimatedMinutes).toBe(20 + 30 + 120); // 170 min
    });

    it("never includes standalone expansions in the session lineup", () => {
      const gamesWithExpansions: GroupGame[] = [
        {
          bggId: 301,
          name: "Survive: Escape from Atlantis!",
          kind: "boardgame",
          minPlayers: 2,
          maxPlayers: 4,
          effectiveMaxPlayers: 6,
          playingTime: 45,
          minPlayingTime: 45,
          maxPlayingTime: 45,
          weight: 1.7,
          yearPublished: 1982,
          description: null,
          minAge: 8,
          coverUrl: null,
          sourceUrl: "https://bgg.com/301",
          designers: [],
          publishers: [],
          categories: [],
          owners: [],
          expansions: [{ bggId: 302, name: "Survive: 5-6 Player Mini Expansion", maxPlayers: 6 }],
        },
        {
          bggId: 302,
          name: "Survive: 5-6 Player Mini Expansion",
          kind: "boardgameexpansion",
          baseGameBggId: 301,
          minPlayers: 2,
          maxPlayers: 6,
          playingTime: 45,
          minPlayingTime: 45,
          maxPlayingTime: 45,
          weight: 1.7,
          yearPublished: 2011,
          description: null,
          minAge: 8,
          coverUrl: null,
          sourceUrl: "https://bgg.com/302",
          designers: [],
          publishers: [],
          categories: [],
          owners: [],
        },
      ];

      const result = planSessionLineup(gamesWithExpansions, {
        playerCount: 6,
        totalMinutes: 120,
      });

      expect(result.status).toBe("success");
      // The base game 301 should be picked because of its effectiveMaxPlayers: 6
      expect(result.lineup.some((s) => s.game.bggId === 301)).toBe(true);
      // The expansion 302 must NEVER be chosen as a slot in the lineup
      expect(result.lineup.some((s) => s.game.bggId === 302)).toBe(false);
    });

    it("favors similar mechanics when mechanicsAffinity is positive", () => {
      const socialDeductionMain: GroupGame = {
        bggId: 501,
        name: "Blood on the Clocktower",
        kind: "boardgame",
        minPlayers: 5,
        maxPlayers: 10,
        playingTime: 90,
        weight: 3.1,
        yearPublished: 2022,
        description: null,
        minAge: 14,
        coverUrl: null,
        sourceUrl: "https://bgg.com/501",
        designers: [],
        publishers: [],
        categories: ["Bluffing", "Deduction"],
        mechanics: ["Social Deduction", "Hidden Roles", "Voting"],
        owners: [],
      };

      const deductionFiller: GroupGame = {
        bggId: 502,
        name: "Secret Hitler",
        kind: "boardgame",
        minPlayers: 5,
        maxPlayers: 10,
        playingTime: 30,
        weight: 1.7,
        yearPublished: 2016,
        description: null,
        minAge: 13,
        coverUrl: null,
        sourceUrl: "https://bgg.com/502",
        designers: [],
        publishers: [],
        categories: ["Bluffing", "Deduction"],
        mechanics: ["Social Deduction", "Hidden Roles"],
        owners: [],
      };

      const dexterityFiller: GroupGame = {
        bggId: 503,
        name: "Junk Art",
        kind: "boardgame",
        minPlayers: 2,
        maxPlayers: 6,
        playingTime: 30,
        weight: 1.2,
        yearPublished: 2016,
        description: null,
        minAge: 8,
        coverUrl: null,
        sourceUrl: "https://bgg.com/503",
        designers: [],
        publishers: [],
        categories: ["Action / Dexterity"],
        mechanics: ["Stacking and Balancing"],
        owners: [],
      };

      const games = [socialDeductionMain, deductionFiller, dexterityFiller];

      // Positive affinity: should strongly favor Secret Hitler as warmup/cooldown
      const similarResult = planSessionLineup(games, {
        playerCount: 6,
        totalMinutes: 150,
        mechanicsAffinity: 1.0,
        random: () => 0.5,
      });

      expect(similarResult.status).toBe("success");
      expect(similarResult.lineup.some((s) => s.game.bggId === 502)).toBe(true);
      expect(similarResult.themeNotice).toContain("Themed Night");

      // Negative affinity: should favor Junk Art over Secret Hitler
      const diverseResult = planSessionLineup(games, {
        playerCount: 6,
        totalMinutes: 150,
        mechanicsAffinity: -1.0,
        random: () => 0.5,
      });

      expect(diverseResult.status).toBe("success");
      expect(diverseResult.lineup.some((s) => s.game.bggId === 503)).toBe(true);
      expect(diverseResult.themeNotice).toContain("Diverse Menu");
    });

    it("anchors session lineup to a specific themeCategory when requested (e.g. Horror)", () => {
      const horrorGame: GroupGame = {
        bggId: 701,
        kind: "boardgame",
        name: "Mansions of Madness",
        weight: 2.7,
        playingTime: 120,
        minPlayers: 1,
        maxPlayers: 5,
        yearPublished: 2016,
        description: null,
        minPlayingTime: 120,
        maxPlayingTime: 180,
        minAge: 14,
        coverUrl: null,
        sourceUrl: "https://bgg.com/701",
        designers: [],
        publishers: [],
        categories: ["Horror", "Adventure", "Murder/Mystery"],
        mechanics: ["Modular Board", "Cooperative Game"],
        owners: [],
      };

      const horrorFiller: GroupGame = {
        bggId: 702,
        kind: "boardgame",
        name: "Scooby-Doo! The Board Game",
        weight: 1.8,
        playingTime: 30,
        minPlayers: 1,
        maxPlayers: 5,
        yearPublished: 2022,
        description: null,
        minPlayingTime: 30,
        maxPlayingTime: 30,
        minAge: 10,
        coverUrl: null,
        sourceUrl: "https://bgg.com/702",
        designers: [],
        publishers: [],
        categories: ["Horror", "Deduction", "Monsters"],
        mechanics: ["Cooperative Game", "Pick-up and Deliver"],
        owners: [],
      };

      const nonHorrorGame: GroupGame = {
        bggId: 703,
        kind: "boardgame",
        name: "Camel Up",
        weight: 1.5,
        playingTime: 45,
        minPlayers: 3,
        maxPlayers: 8,
        yearPublished: 2019,
        description: null,
        minPlayingTime: 30,
        maxPlayingTime: 45,
        minAge: 8,
        coverUrl: null,
        sourceUrl: "https://bgg.com/703",
        designers: [],
        publishers: [],
        categories: ["Animals", "Racing"],
        mechanics: ["Betting and Bluffing", "Roll / Spin and Move"],
        owners: [],
      };

      const result = planSessionLineup([horrorGame, horrorFiller, nonHorrorGame], {
        playerCount: 4,
        totalMinutes: 180,
        themeCategory: "Horror",
        random: () => 0.5,
      });

      expect(result.status).toBe("success");
      expect(result.themeNotice).toBe("🎭 Themed Night: Horror");
      expect(result.lineup.some((s) => s.game.bggId === 701)).toBe(true);
      expect(result.lineup.some((s) => s.game.bggId === 702)).toBe(true);
      expect(result.lineup.some((s) => s.game.bggId === 703)).toBe(false);
    });
  });

  describe("planSessionMenuTrio (3 Contrasting Menu Options for Voting)", () => {
    const diverseCollection: GroupGame[] = [
      {
        bggId: 101,
        kind: "boardgame",
        name: "Brass: Birmingham",
        weight: 3.9,
        playingTime: 120,
        minPlayers: 2,
        maxPlayers: 4,
        yearPublished: 2018,
        description: null,
        minPlayingTime: 60,
        maxPlayingTime: 120,
        minAge: 14,
        coverUrl: null,
        sourceUrl: "https://bgg.com/101",
        designers: [],
        publishers: [],
        categories: ["Economic"],
        mechanics: ["Network and Route Building", "Income"],
        owners: [{ displayName: "Alice" }],
      },
      {
        bggId: 102,
        kind: "boardgame",
        name: "Codenames",
        weight: 1.3,
        playingTime: 15,
        minPlayers: 2,
        maxPlayers: 8,
        yearPublished: 2015,
        description: null,
        minPlayingTime: 15,
        maxPlayingTime: 15,
        minAge: 10,
        coverUrl: null,
        sourceUrl: "https://bgg.com/102",
        designers: [],
        publishers: [],
        categories: ["Party", "Word Game"],
        mechanics: ["Deduction", "Push Your Luck"],
        owners: [{ displayName: "Bob" }],
      },
      {
        bggId: 103,
        kind: "boardgame",
        name: "The Resistance: Avalon",
        weight: 1.8,
        playingTime: 30,
        minPlayers: 4,
        maxPlayers: 10,
        yearPublished: 2012,
        description: null,
        minPlayingTime: 30,
        maxPlayingTime: 30,
        minAge: 13,
        coverUrl: null,
        sourceUrl: "https://bgg.com/103",
        designers: [],
        publishers: [],
        categories: ["Bluffing", "Deduction"],
        mechanics: ["Social Deduction", "Hidden Roles", "Voting"],
        owners: [{ displayName: "Charlie" }],
      },
      {
        bggId: 104,
        kind: "boardgame",
        name: "Wingspan",
        weight: 2.4,
        playingTime: 70,
        minPlayers: 1,
        maxPlayers: 5,
        yearPublished: 2019,
        description: null,
        minPlayingTime: 40,
        maxPlayingTime: 70,
        minAge: 10,
        coverUrl: null,
        sourceUrl: "https://bgg.com/104",
        designers: [],
        publishers: [],
        categories: ["Animals"],
        mechanics: ["Engine Building", "Card Drafting"],
        owners: [{ displayName: "Alice" }],
      },
      {
        bggId: 105,
        kind: "boardgame",
        name: "Cascadia",
        weight: 1.8,
        playingTime: 35,
        minPlayers: 1,
        maxPlayers: 4,
        yearPublished: 2021,
        description: null,
        minPlayingTime: 30,
        maxPlayingTime: 45,
        minAge: 10,
        coverUrl: null,
        sourceUrl: "https://bgg.com/105",
        designers: [],
        publishers: [],
        categories: ["Puzzle", "Animals"],
        mechanics: ["Tile Placement", "Drafting"],
        owners: [{ displayName: "Bob" }],
      },
    ];

    it("generates 3 distinct menu options with contrasting styles", () => {
      const interestWeights = new Map<number, number>([
        [104, 10], // Wingspan has highest interest points
        [105, 5],
      ]);

      const result = planSessionMenuTrio(diverseCollection, {
        playerCount: 4,
        totalMinutes: 180,
        allowHeavy: true,
        weightsMap: interestWeights,
        random: () => 0.1,
      });

      expect(result.status).toBe("success");
      expect(result.options).toHaveLength(3);

      const [optA, optB, optC] = result.options;
      expect(optA.id).toBe("A");
      expect(optB.id).toBe("B");
      expect(optC.id).toBe("C");

      // Verify each option has a distinct main anchor game
      const mainA = optA.lineup.find((s) => s.role === "main");
      const mainB = optB.lineup.find((s) => s.role === "main");
      const mainC = optC.lineup.find((s) => s.role === "main");
      expect(mainA?.game.bggId).toBeDefined();
      expect(mainB?.game.bggId).toBeDefined();
      expect(mainC?.game.bggId).toBeDefined();
      expect(mainA?.game.bggId).not.toBe(mainB?.game.bggId);
      expect(mainB?.game.bggId).not.toBe(mainC?.game.bggId);
      expect(mainA?.game.bggId).not.toBe(mainC?.game.bggId);

      // Verify each option has a distinct recipe style badge and title
      expect(optA.styleBadge).not.toBe(optB.styleBadge);
      expect(optB.styleBadge).not.toBe(optC.styleBadge);
      expect(optA.styleBadge).not.toBe(optC.styleBadge);

      // All options should have valid estimated times and transitions
      for (const opt of result.options) {
        expect(opt.totalEstimatedMinutes).toBeGreaterThan(0);
        expect(opt.lineup.length).toBeGreaterThan(0);
        expect(opt.votes).toEqual([]);
      }
    });

    it("provides at least 10 distinct menu recipes and dynamically samples contrasting options in English", () => {
      expect(MENU_RECIPES.length).toBeGreaterThanOrEqual(10);

      const roll1 = planSessionMenuTrio(diverseCollection, {
        playerCount: 4,
        totalMinutes: 180,
        random: () => 0.1,
      });

      const roll2 = planSessionMenuTrio(diverseCollection, {
        playerCount: 4,
        totalMinutes: 180,
        random: () => 0.85,
      });

      expect(roll1.options).toHaveLength(3);
      expect(roll2.options).toHaveLength(3);

      // Verify titles are in English with Option prefixes
      for (const opt of roll1.options) {
        expect(opt.title).toMatch(/^Option [A-C]: /);
      }
    });

    it("features dedicated heavy euro brain burner recipe favoring >= 3.0 weight games", () => {
      const brainBurnerRecipe = MENU_RECIPES.find((r) => r.id === "heavy_euro_brainburner");
      expect(brainBurnerRecipe).toBeDefined();
      expect(brainBurnerRecipe?.category).toBe("heavy");

      const weights = brainBurnerRecipe?.getWeightsAndOptions(diverseCollection, new Map());
      expect(weights?.allowHeavy).toBe(true);
      // Brass Birmingham (101, weight 3.9) should receive a huge boost
      expect(weights?.weightsMap.get(101)).toBeGreaterThan(70);
    });

    it("features dedicated pure random wildcard recipe with neutral weights", () => {
      const wildcardRecipe = MENU_RECIPES.find((r) => r.id === "wildcard_random");
      expect(wildcardRecipe).toBeDefined();
      expect(wildcardRecipe?.category).toBe("wildcard");

      const weights = wildcardRecipe?.getWeightsAndOptions(diverseCollection, new Map());
      expect(weights?.mechanicsAffinity).toBe(0);
      for (const game of diverseCollection) {
        expect(weights?.weightsMap.get(game.bggId)).toBe(1);
      }
    });

    it("handles smaller collections gracefully by providing 3 valid lineups without crashing", () => {
      const smallCollection = [diverseCollection[1], diverseCollection[2]]; // Codenames and Avalon
      const result = planSessionMenuTrio(smallCollection as GroupGame[], {
        playerCount: 4,
        totalMinutes: 60,
      });

      expect(result.status).toBe("success");
      expect(result.options).toHaveLength(3);
      for (const opt of result.options) {
        expect(opt.lineup.length).toBeGreaterThan(0);
      }
    });

    it("returns empty or no_match if no game supports the headcount", () => {
      const result = planSessionMenuTrio(diverseCollection, {
        playerCount: 20, // no game supports 20 players
        totalMinutes: 180,
      });

      expect(result.status).toBe("no_match");
      expect(result.options).toHaveLength(0);
    });

    it("prevents repeating filler games across options when sufficient games exist", () => {
      // 8 distinct games to provide ample choices
      const largeCollection: GroupGame[] = [
        { ...diverseCollection[0], bggId: 801, name: "Heavy Strategy 1" },
        { ...diverseCollection[0], bggId: 802, name: "Heavy Strategy 2", weight: 3.5 },
        { ...diverseCollection[3], bggId: 803, name: "Meaty Game 3" },
        { ...diverseCollection[1], bggId: 804, name: "Filler A", playingTime: 20 },
        { ...diverseCollection[2], bggId: 805, name: "Filler B", playingTime: 25 },
        { ...diverseCollection[4], bggId: 806, name: "Filler C", playingTime: 30 },
        { ...diverseCollection[1], bggId: 807, name: "Filler D", playingTime: 15 },
        { ...diverseCollection[2], bggId: 808, name: "Filler E", playingTime: 20 },
      ];

      const result = planSessionMenuTrio(largeCollection, {
        playerCount: 4,
        totalMinutes: 180,
        random: () => 0.2,
      });

      expect(result.status).toBe("success");
      expect(result.options).toHaveLength(3);

      const [optA, optB, optC] = result.options;
      const gameIdsA = new Set(optA.lineup.map((s) => s.game.bggId));
      const gameIdsB = new Set(optB.lineup.map((s) => s.game.bggId));
      const gameIdsC = new Set(optC.lineup.map((s) => s.game.bggId));

      // Option A and Option B should have zero overlapping games
      const overlapAB = [...gameIdsA].filter((id) => gameIdsB.has(id));
      expect(overlapAB).toHaveLength(0);

      // Option B and Option C should have zero overlapping games
      const overlapBC = [...gameIdsB].filter((id) => gameIdsC.has(id));
      expect(overlapBC).toHaveLength(0);
    });

    it("applies negative penalties in recipes so non-spatial games do not win spatial puzzle", () => {
      const spatialRecipe = MENU_RECIPES.find((r) => r.id === "spatial_puzzle");
      expect(spatialRecipe).toBeDefined();

      const nonSpatialGame = diverseCollection[0]; // Brass Birmingham (economic route building)
      const spatialGame = diverseCollection[4]; // Cascadia (Tile Placement)

      const weights = spatialRecipe?.getWeightsAndOptions([nonSpatialGame, spatialGame], new Map());
      expect(weights?.weightsMap.get(spatialGame.bggId)).toBeGreaterThan(35);
      expect(weights?.weightsMap.get(nonSpatialGame.bggId)).toBeLessThan(1);
    });

    it("allows casual and light games to pair with a short/light main game in a casual night", () => {
      const scoobyDoo: GroupGame = {
        bggId: 901,
        kind: "boardgame",
        name: "Scooby-Doo! The Board Game",
        weight: 1.8,
        playingTime: 30,
        minPlayers: 1,
        maxPlayers: 5,
        yearPublished: 2022,
        description: null,
        minPlayingTime: 30,
        maxPlayingTime: 30,
        minAge: 10,
        coverUrl: null,
        categories: ["Adventure", "Horror"],
        mechanics: ["Cooperative Game"],
        designers: [],
        publishers: [],
        owners: [],
      };

      const sagrada: GroupGame = {
        bggId: 902,
        kind: "boardgame",
        name: "Sagrada",
        weight: 1.9,
        playingTime: 45,
        minPlayers: 1,
        maxPlayers: 4,
        yearPublished: 2017,
        description: null,
        minPlayingTime: 30,
        maxPlayingTime: 45,
        minAge: 14,
        coverUrl: null,
        categories: ["Dice", "Puzzle"],
        mechanics: ["Dice Rolling", "Pattern Building"],
        designers: [],
        publishers: [],
        owners: [],
      };

      const wombat: GroupGame = {
        bggId: 903,
        kind: "boardgame",
        name: "Hand-to-Hand Wombat",
        weight: 1.1,
        playingTime: 15,
        minPlayers: 3,
        maxPlayers: 6,
        yearPublished: 2022,
        description: null,
        minPlayingTime: 15,
        maxPlayingTime: 15,
        minAge: 7,
        coverUrl: null,
        categories: ["Party Game", "Bluffing"],
        mechanics: ["Real-Time", "Traitor"],
        designers: [],
        publishers: [],
        owners: [],
      };

      // In a 180 min gathering, if Scooby-Doo is main, Sagrada and Wombat can still pair
      const result = planSessionLineup([scoobyDoo, sagrada, wombat], {
        playerCount: 4,
        totalMinutes: 180,
      });

      expect(result.status).toBe("success");
      expect(result.lineup.length).toBe(3);
      expect(result.totalEstimatedMinutes).toBeGreaterThanOrEqual(100);
      const names = result.lineup.map((s) => s.game.name);
      expect(names).toContain("Scooby-Doo! The Board Game");
      expect(names).toContain("Sagrada");
      expect(names).toContain("Hand-to-Hand Wombat");
    });
  });
});
