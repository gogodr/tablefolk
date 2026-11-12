import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../lib/errors.js";

const state = vi.hoisted(() => ({
  links: [] as Array<{
    id: string; groupId: string; creatorId: string; tokenHash: string;
    expiresAt: Date | null; revokedAt: Date | null; createdAt: Date; joinCount: number;
  }>,
  memberships: [] as string[],
}));

vi.mock("../auth.js", () => ({
  requireUser: async () => ({ id: "owner" }),
  requireCreator: async () => ({ id: "group", creatorId: "owner" }),
}));

vi.mock("../db.js", () => {
  const client = {
    groupInviteLink: {
      findMany: async () => state.links,
      create: async ({ data }: { data: typeof state.links[number] }) => {
        const link = { ...data, id: String(state.links.length + 1), revokedAt: null, createdAt: new Date(), joinCount: 0 };
        state.links.push(link);
        return link;
      },
      findUnique: async ({ where, include }: { where: { tokenHash: string }; include?: unknown }) => {
        const link = state.links.find((item) => item.tokenHash === where.tokenHash);
        return link && include ? { ...link, group: { name: "Game night" } } : link ?? null;
      },
      findFirst: async ({ where }: { where: { id: string; groupId: string } }) =>
        state.links.find((item) => item.id === where.id && item.groupId === where.groupId) ?? null,
      updateMany: async ({ where, data }: {
        where: { id: string; groupId?: string; revokedAt: null; OR?: unknown };
        data: { revokedAt?: Date; joinCount?: { increment: number } };
      }) => {
        const link = state.links.find((item) => item.id === where.id && item.revokedAt === null && (!where.groupId || item.groupId === where.groupId));
        if (!link || (where.OR && link.expiresAt && link.expiresAt <= new Date())) return { count: 0 };
        if (data.revokedAt) link.revokedAt = data.revokedAt;
        if (data.joinCount) link.joinCount += data.joinCount.increment;
        return { count: 1 };
      },
    },
    groupMember: {
      upsert: async ({ create }: { create: { userId: string } }) => { state.memberships.push(create.userId); },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(client),
  };
  return { db: () => client };
});

import { inviteLinkRoutes } from "./invite-links.js";

describe("group invite links", () => {
  const app = Fastify();
  beforeAll(async () => {
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) return reply.code(error.status).send({ code: error.code });
      return reply.code(400).send({ code: "VALIDATION" });
    });
    await app.register(inviteLinkRoutes);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { state.links.length = 0; state.memberships.length = 0; });

  it("creates a reusable link without expiration and accepts repeated uses", async () => {
    const created = await app.inject({ method: "POST", url: "/v1/groups/group/invite-links", payload: { expiresAt: null } });
    expect(created.statusCode).toBe(201);
    const { url, link } = created.json();
    expect(link.status).toBe("ACTIVE");
    expect(link.expiresAt).toBeNull();
    const token = new URL(url).pathname.split("/").pop();
    expect(state.links[0]?.tokenHash).not.toBe(token);

    for (let index = 0; index < 2; index++) {
      const joined = await app.inject({ method: "POST", url: `/v1/invite-links/${token}/join` });
      expect(joined.statusCode).toBe(200);
      expect(joined.json()).toEqual({ groupId: "group" });
    }
    expect(state.memberships).toHaveLength(2);
  });

  it("rejects past dates and prevents joining after expiration or revocation", async () => {
    const past = await app.inject({ method: "POST", url: "/v1/groups/group/invite-links", payload: { expiresAt: "2020-01-01T00:00:00.000Z" } });
    expect(past.statusCode).toBe(400);
    expect(state.links).toHaveLength(0);

    const created = await app.inject({ method: "POST", url: "/v1/groups/group/invite-links", payload: { expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    const { url, link } = created.json();
    const token = new URL(url).pathname.split("/").pop();
    state.links[0]!.expiresAt = new Date(Date.now() - 1);
    expect((await app.inject({ method: "POST", url: `/v1/invite-links/${token}/join` })).statusCode).toBe(409);

    state.links[0]!.expiresAt = null;
    expect((await app.inject({ method: "DELETE", url: `/v1/groups/group/invite-links/${link.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: `/v1/invite-links/${token}/join` })).statusCode).toBe(409);
    expect(state.memberships).toHaveLength(0);
  });
});
