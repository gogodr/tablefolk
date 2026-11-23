import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  gameCovers: new Map<number, { bggId: number; contentType: string; data: Uint8Array }>(),
  games: new Map<number, { bggId: number; name: string; coverUrl: string | null }>(),
}));

vi.mock("../services/bgg.js", () => ({
  getBggGame: async (bggId: number) => {
    if (bggId === 888) {
      return {
        bggId,
        name: "Wingspan",
        imageUrl: "https://cf.geekdo-images.com/wingspan.jpg",
      };
    }
    return {
      bggId,
      name: `Game ${bggId}`,
      imageUrl: null,
    };
  },
}));

vi.mock("../services/cover-store.js", () => ({
  fetchCover: async (imageUrl: string | null) => {
    if (imageUrl === "https://cf.geekdo-images.com/wingspan.jpg") {
      return {
        contentType: "image/jpeg" as const,
        data: new Uint8Array([1, 2, 3, 4]),
      };
    }
    return null;
  },
}));

vi.mock("../config.js", () => ({
  config: {
    coverStorageAllowed: true,
  },
}));

vi.mock("../db.js", () => {
  const client = {
    gameCover: {
      findUnique: async ({ where }: { where: { bggId: number } }) => {
        return state.gameCovers.get(where.bggId) ?? null;
      },
      upsert: async ({ where, create, update }: any) => {
        const item = { bggId: where.bggId, ...create, ...update };
        state.gameCovers.set(where.bggId, item);
        return item;
      },
    },
    game: {
      updateMany: async ({ where, data }: any) => {
        const game = state.games.get(where.bggId);
        if (game) {
          Object.assign(game, data);
        }
        return { count: game ? 1 : 0 };
      },
    },
  };
  return { db: () => client };
});

describe("coverRoutes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    const { coverRoutes } = await import("./covers.js");
    app = Fastify();
    await coverRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    state.gameCovers.clear();
    state.games.clear();
  });

  it("returns 400 for invalid game ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/covers/0",
    });
    expect(res.statusCode).toBe(400);
  });

  it("serves an existing cached cover from gameCover table", async () => {
    state.gameCovers.set(100, {
      bggId: 100,
      contentType: "image/png",
      data: new Uint8Array([10, 20, 30]),
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/covers/100",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toBe("public, max-age=86400");
    expect(res.rawPayload).toEqual(Buffer.from([10, 20, 30]));
  });

  it("fetches on-demand from BGG and caches when missing from gameCover", async () => {
    state.games.set(888, { bggId: 888, name: "Wingspan", coverUrl: null });

    const res = await app.inject({
      method: "GET",
      url: "/v1/covers/888",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.rawPayload).toEqual(Buffer.from([1, 2, 3, 4]));

    // Check that it cached to state.gameCovers
    expect(state.gameCovers.has(888)).toBe(true);
    expect(state.gameCovers.get(888)?.contentType).toBe("image/jpeg");

    // Check that db().game was updated with coverUrl
    expect(state.games.get(888)?.coverUrl).toBe("/v1/covers/888");
  });

  it("returns 404 when cover is neither cached nor available on BGG", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/covers/555",
    });

    expect(res.statusCode).toBe(404);
  });
});
