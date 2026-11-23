import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  currentUser: { id: "user-ricardo", displayName: "Ricardo Scargglioni" },
  groupShares: [
    {
      id: "share-1",
      groupId: "group-1",
      userId: "user-ricardo",
      bggId: 100,
      user: { id: "user-ricardo", displayName: "Ricardo Scargglioni", bggUsername: "ricardo" },
      collection: { isAvailable: true, isStandalone: false, versionName: null },
      game: {
        bggId: 100,
        name: "Catan",
        kind: "boardgame",
        minPlayers: 3,
        maxPlayers: 4,
        playingTime: 75,
        minPlayingTime: 60,
        maxPlayingTime: 90,
        weight: 2.3,
        minAge: 10,
        coverUrl: null,
        sourceUrl: "",
        designers: ["Klaus Teuber"],
        publishers: ["Kosmos"],
        categories: ["Strategy", "Economic"],
        mechanics: ["Trading"],
      },
    },
    {
      id: "share-2",
      groupId: "group-1",
      userId: "user-gonzalo",
      bggId: 200,
      user: { id: "user-gonzalo", displayName: "Gonzalo Diaz", bggUsername: "gonzalo" },
      collection: { isAvailable: true, isStandalone: false, versionName: null },
      game: {
        bggId: 200,
        name: "Ticket to Ride",
        kind: "boardgame",
        minPlayers: 2,
        maxPlayers: 5,
        playingTime: 45,
        minPlayingTime: 30,
        maxPlayingTime: 60,
        weight: 1.8,
        minAge: 8,
        coverUrl: null,
        sourceUrl: "",
        designers: ["Alan R. Moon"],
        publishers: ["Days of Wonder"],
        categories: ["Trains", "Family"],
        mechanics: ["Route Building"],
      },
    },
  ],
  groupMembers: [
    { groupId: "group-1", userId: "user-ricardo" },
    { groupId: "group-1", userId: "user-gonzalo" },
  ],
}));

vi.mock("../auth.js", () => ({
  requireUser: async () => state.currentUser,
  requireMember: async () => state.groupMembers[0],
}));

vi.mock("../db.js", () => ({
  db: () => ({
    groupShare: {
      findMany: async (args: any) => {
        let list = state.groupShares.filter((s) => s.groupId === args.where.groupId);
        if (args.where.userId?.in) {
          list = list.filter((s) => args.where.userId.in.includes(s.userId));
        }
        return list;
      },
    },
    gameInterest: {
      findMany: async () => [],
    },
  }),
}));

import { pickRoutes } from "./picks.js";

describe("Picks and Lineup with contributor filtering (includedOwnerIds)", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(pickRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("draws from all contributors when includedOwnerIds is not specified", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/group-1/picks",
      payload: {
        playerCount: 4,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("picked");
    expect(body.eligibleCount).toBe(2);
  });

  it("filters out games from deactivated contributors in single pick", async () => {
    // Only Ricardo is present (Gonzalo deactivated)
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/group-1/picks",
      payload: {
        playerCount: 4,
        includedOwnerIds: ["user-ricardo"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("picked");
    expect(body.eligibleCount).toBe(1);
    expect(body.game.bggId).toBe(100); // Catan only
  });

  it("filters out games from deactivated contributors in session lineup", async () => {
    // Only Gonzalo is present (Ricardo deactivated)
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/group-1/lineup",
      payload: {
        playerCount: 4,
        totalMinutes: 120,
        includedOwnerIds: ["user-gonzalo"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("success");
    expect(body.lineup.length).toBeGreaterThan(0);
    expect(body.lineup.every((slot: any) => slot.game.bggId === 200)).toBe(true);
  });

  it("returns empty when all contributors are deactivated", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/group-1/picks",
      payload: {
        playerCount: 4,
        includedOwnerIds: [],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("empty");
    expect(body.eligibleCount).toBe(0);
  });
});
