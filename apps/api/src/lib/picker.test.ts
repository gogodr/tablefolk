import { describe, expect, it } from "vitest";
import { chooseGameId, eligibleGameIds } from "./picker.js";

describe("game night picker", () => {
  const games = [
    { bggId: 42, minPlayers: 2, maxPlayers: 4 },
    { bggId: 42, minPlayers: 2, maxPlayers: 4 },
    { bggId: 17, minPlayers: 3, maxPlayers: 6 },
    { bggId: 99, minPlayers: null, maxPlayers: null },
  ];

  it("counts a multiply shared game once and includes player range endpoints", () => {
    expect(eligibleGameIds(games, 2)).toEqual([42]);
    expect(eligibleGameIds(games, 4)).toEqual([17, 42]);
    expect(eligibleGameIds(games, 6)).toEqual([17]);
  });

  it("excludes games with unknown or incompatible player counts", () => {
    expect(eligibleGameIds(games, 7)).toEqual([]);
    expect(eligibleGameIds([{ bggId: 1, minPlayers: 5, maxPlayers: 2 }], 3)).toEqual([]);
  });

  it("picks a different game on reroll when one exists", () => {
    expect(chooseGameId([17, 42], 17, () => 0)).toBe(42);
    expect(chooseGameId([17], 17, () => 0)).toBe(17);
  });
});
