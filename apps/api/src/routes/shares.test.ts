import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors.js";

const state = vi.hoisted(() => ({
  collectionItems: [] as Array<{
    userId: string;
    bggId: number;
    game: { bggId: number; name: string; kind: string; baseGameBggId?: number | null };
  }>,
  groupShares: [] as Array<{ groupId: string; userId: string; bggId: number }>,
}));

vi.mock("../auth.js", () => ({
  requireUser: async () => ({ id: "user-1" }),
  requireMember: async () => ({ id: "group-1" }),
}));

vi.mock("../db.js", () => {
  const client = {
    collectionItem: {
      findUnique: async ({ where }: { where: { userId_bggId: { userId: string; bggId: number } } }) => {
        return (
          state.collectionItems.find(
            (i) => i.userId === where.userId_bggId.userId && i.bggId === where.userId_bggId.bggId
          ) ?? null
        );
      },
      findMany: async ({ where }: { where: { userId: string; game?: { baseGameBggId?: number | null } } }) => {
        return state.collectionItems.filter((i) => {
          if (i.userId !== where.userId) return false;
          if (where.game?.baseGameBggId !== undefined) {
            return i.game.baseGameBggId === where.game.baseGameBggId;
          }
          return true;
        });
      },
    },
    groupShare: {
      findUnique: async ({ where }: { where: { groupId_userId_bggId: { groupId: string; userId: string; bggId: number } } }) => {
        return (
          state.groupShares.find(
            (s) =>
              s.groupId === where.groupId_userId_bggId.groupId &&
              s.userId === where.groupId_userId_bggId.userId &&
              s.bggId === where.groupId_userId_bggId.bggId
          ) ?? null
        );
      },
      upsert: async ({
        where,
        create,
      }: {
        where: { groupId_userId_bggId: { groupId: string; userId: string; bggId: number } };
        create: { groupId: string; userId: string; bggId: number };
      }) => {
        const existing = state.groupShares.find(
          (s) =>
            s.groupId === where.groupId_userId_bggId.groupId &&
            s.userId === where.groupId_userId_bggId.userId &&
            s.bggId === where.groupId_userId_bggId.bggId
        );
        if (!existing) {
          state.groupShares.push(create);
        }
        return create;
      },
      deleteMany: async ({ where }: { where: { groupId: string; userId: string; bggId: { in: number[] } } }) => {
        const initial = state.groupShares.length;
        state.groupShares = state.groupShares.filter(
          (s) => !(s.groupId === where.groupId && s.userId === where.userId && where.bggId.in.includes(s.bggId))
        );
        return { count: initial - state.groupShares.length };
      },
    },
  };
  return { db: () => client };
});

import { shareRoutes } from "./shares.js";

describe("share routes with expansion cascading", () => {
  const app = Fastify();
  beforeAll(async () => {
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) return reply.code(error.status).send({ code: error.code, message: error.message });
      return reply.code(400).send({ code: "VALIDATION" });
    });
    await app.register(shareRoutes);
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    state.collectionItems = [
      {
        userId: "user-1",
        bggId: 13, // Catan (base game)
        game: { bggId: 13, name: "Catan", kind: "boardgame", baseGameBggId: null },
      },
      {
        userId: "user-1",
        bggId: 2655, // Catan 5-6 Player (expansion)
        game: { bggId: 2655, name: "Catan: 5-6 Player Extension", kind: "boardgameexpansion", baseGameBggId: 13 },
      },
      {
        userId: "user-1",
        bggId: 325, // Catan Seafarers (expansion)
        game: { bggId: 325, name: "Catan: Seafarers", kind: "boardgameexpansion", baseGameBggId: 13 },
      },
    ];
    state.groupShares = [];
  });

  it("sharing a base game automatically cascades and shares all owned expansions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/groups/group-1/shares",
      payload: { bggId: 13 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ shared: true, sharedCount: 3 });
    expect(state.groupShares.map((s) => s.bggId).sort()).toEqual([13, 325, 2655].sort());
  });

  it("unsharing a single expansion only unshares that expansion", async () => {
    // Start with all 3 shared
    state.groupShares = [
      { groupId: "group-1", userId: "user-1", bggId: 13 },
      { groupId: "group-1", userId: "user-1", bggId: 2655 },
      { groupId: "group-1", userId: "user-1", bggId: 325 },
    ];

    const res = await app.inject({
      method: "DELETE",
      url: "/v1/groups/group-1/shares/325",
    });

    expect(res.statusCode).toBe(204);
    // 13 and 2655 remain shared
    expect(state.groupShares.map((s) => s.bggId).sort()).toEqual([13, 2655].sort());
  });

  it("unsharing the base game unshares the base game and all its expansions", async () => {
    state.groupShares = [
      { groupId: "group-1", userId: "user-1", bggId: 13 },
      { groupId: "group-1", userId: "user-1", bggId: 2655 },
      { groupId: "group-1", userId: "user-1", bggId: 325 },
    ];

    const res = await app.inject({
      method: "DELETE",
      url: "/v1/groups/group-1/shares/13",
    });

    expect(res.statusCode).toBe(204);
    expect(state.groupShares).toHaveLength(0);
  });
});
