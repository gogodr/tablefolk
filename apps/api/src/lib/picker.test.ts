import { describe, expect, it } from "vitest";
import {
  chooseGameId,
  chooseWeightedGameId,
  eligibleGameIds,
  planSessionLineup,
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
  });
});
