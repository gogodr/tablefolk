import { describe, expect, it } from "vitest";
import { chooseGameId, chooseWeightedGameId, eligibleGameIds } from "./picker.js";

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
    // If game 42 has weight 9 and game 17 has weight 1, random roll of 0.5 (target 5.0) will choose 42
    const weights = { 17: 1, 42: 9 };
    expect(chooseWeightedGameId([17, 42], weights, undefined, () => 0.05)).toBe(17); // target = 0.5 -> 17
    expect(chooseWeightedGameId([17, 42], weights, undefined, () => 0.5)).toBe(42); // target = 5.0 -> 42
  });
});
