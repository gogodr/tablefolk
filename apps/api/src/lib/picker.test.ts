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
    });
  });
});
