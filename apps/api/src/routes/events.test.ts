import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

interface MockEvent {
  id: string;
  groupId: string;
  creatorId: string | null;
  hostUserId: string | null;
  title: string;
  description: string | null;
  scheduledDate: Date;
  location: string | null;
  manualHeadcount: number | null;
  status: string;
  playedBggIds: number[];
  officialPickBggId: number | null;
  officialPickCarrier: string | null;
  officialLineup: any;
  menuPoll: any;
  createdAt: Date;
}

interface MockRsvp {
  id: string;
  eventId: string;
  userId: string;
  status: string;
  additionalGuests: number;
  updatedAt: Date;
}

const state = vi.hoisted(() => ({
  currentUser: { id: "user-ricardo", displayName: "Ricardo" },
  events: [] as MockEvent[],
  rsvps: [] as MockRsvp[],
  games: [
    { bggId: 42, name: "Catan", minPlayers: 3, maxPlayers: 4, minPlaytime: 60, maxPlaytime: 90, weight: 2.3, imageUrl: null },
    { bggId: 13, name: "Ticket to Ride", minPlayers: 2, maxPlayers: 5, minPlaytime: 30, maxPlaytime: 60, weight: 1.8, imageUrl: null },
  ] as any[],
  groupMembers: [
    { groupId: "group-1", userId: "user-ricardo" },
    { groupId: "group-1", userId: "user-gogo" },
  ],
  group: { id: "group-1", name: "Board Game Group", creatorId: "user-ricardo" },
}));

vi.mock("../auth.js", () => ({
  requireUser: async () => state.currentUser,
}));

vi.mock("../services/bgg.js", () => ({
  getBggGame: async (bggId: number) => ({
    bggId,
    kind: "boardgame",
    name: bggId === 999 ? "Terraforming Mars" : `BGG Game ${bggId}`,
    alternateNames: [],
    yearPublished: 2016,
    description: "Mars colonization",
    minPlayers: 1,
    maxPlayers: 5,
    playingTime: 120,
    minPlayingTime: 90,
    maxPlayingTime: 120,
    weight: 3.25,
    minAge: 12,
    designers: ["Jacob Fryxelius"],
    publishers: ["FryxGames"],
    categories: ["Economic", "Sci-Fi"],
    mechanics: ["Card Drafting", "Tile Placement"],
    sourceUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
  }),
}));

vi.mock("../db.js", () => {
  const client = {
    groupMember: {
      findUnique: async ({ where }: { where: { groupId_userId: { groupId: string; userId: string } } }) => {
        return state.groupMembers.find(
          (m) => m.groupId === where.groupId_userId.groupId && m.userId === where.groupId_userId.userId
        ) ?? null;
      },
    },
    event: {
      create: async ({ data, include }: any) => {
        const ev: MockEvent = {
          id: "event-1",
          groupId: data.groupId,
          creatorId: data.creatorId ?? null,
          hostUserId: data.hostUserId ?? null,
          title: data.title,
          description: data.description ?? null,
          scheduledDate: data.scheduledDate,
          location: data.location ?? null,
          manualHeadcount: data.manualHeadcount ?? null,
          status: "SCHEDULED",
          playedBggIds: [],
          officialPickBggId: null,
          officialPickCarrier: null,
          officialLineup: null,
          menuPoll: null,
          createdAt: new Date(),
        };
        state.events.push(ev);
        if (data.rsvps?.create) {
          state.rsvps.push({
            id: "rsvp-1",
            eventId: ev.id,
            userId: data.rsvps.create.userId,
            status: data.rsvps.create.status,
            additionalGuests: data.rsvps.create.additionalGuests ?? 0,
            updatedAt: new Date(),
          });
        }
        return {
          ...ev,
          group: { id: "group-1", name: "Board Game Group", creatorId: state.group.creatorId },
          creator: { id: ev.creatorId, displayName: "Ricardo" },
          host: ev.hostUserId ? { id: ev.hostUserId, displayName: "Gogo" } : null,
          officialPick: null,
          rsvps: state.rsvps.filter((r) => r.eventId === ev.id).map((r) => ({
            ...r,
            user: { id: r.userId, displayName: r.userId === "user-ricardo" ? "Ricardo" : "Gogo", bggUsername: null },
          })),
        };
      },
      findUnique: async ({ where, include }: any) => {
        const ev = state.events.find((e) => e.id === where.id);
        if (!ev) return null;
        return {
          ...ev,
          group: { id: "group-1", name: "Board Game Group", creatorId: state.group.creatorId },
          creator: { id: ev.creatorId, displayName: "Ricardo" },
          host: ev.hostUserId ? { id: ev.hostUserId, displayName: "Gogo" } : null,
          officialPick: null,
          rsvps: state.rsvps.filter((r) => r.eventId === ev.id).map((r) => ({
            ...r,
            user: { id: r.userId, displayName: r.userId === "user-ricardo" ? "Ricardo" : "Gogo", bggUsername: null },
          })),
        };
      },
      update: async ({ where, data, include }: any) => {
        const ev = state.events.find((e) => e.id === where.id);
        if (!ev) throw new Error("Event not found");
        Object.assign(ev, data);
        return {
          ...ev,
          group: { id: "group-1", name: "Board Game Group", creatorId: state.group.creatorId },
          creator: { id: ev.creatorId, displayName: "Ricardo" },
          host: ev.hostUserId ? { id: ev.hostUserId, displayName: "Gogo" } : null,
          officialPick: null,
          rsvps: state.rsvps.filter((r) => r.eventId === ev.id).map((r) => ({
            ...r,
            user: { id: r.userId, displayName: r.userId === "user-ricardo" ? "Ricardo" : "Gogo", bggUsername: null },
          })),
        };
      },
    },
    eventRsvp: {
      findMany: async ({ where }: any) => {
        return state.rsvps.filter((r) => r.eventId === where.eventId && (!where.status || r.status === where.status));
      },
      upsert: async ({ where, create, update }: any) => {
        let rsvp = state.rsvps.find(
          (r) => r.eventId === where.eventId_userId.eventId && r.userId === where.eventId_userId.userId
        );
        if (rsvp) {
          Object.assign(rsvp, update, { updatedAt: new Date() });
        } else {
          rsvp = {
            id: `rsvp-${state.rsvps.length + 1}`,
            eventId: create.eventId,
            userId: create.userId,
            status: create.status,
            additionalGuests: create.additionalGuests ?? 0,
            updatedAt: new Date(),
          };
          state.rsvps.push(rsvp);
        }
        return rsvp;
      },
      update: async ({ where, data }: any) => {
        const rsvp = state.rsvps.find((r) => r.id === where.id);
        if (rsvp) Object.assign(rsvp, data);
        return rsvp;
      },
    },
    gameInterest: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    user: {
      findUnique: async () => ({ id: "user-ricardo", votingPoints: 5 }),
      update: async () => ({ id: "user-ricardo", votingPoints: 5 }),
    },
    game: {
      findMany: async ({ where }: any) => {
        const all = [...state.games];
        if (where?.bggId?.in) {
          return all.filter((g) => where.bggId.in.includes(g.bggId));
        }
        return all;
      },
      upsert: async ({ where, create, update }: any) => {
        let existing = state.games.find((g) => g.bggId === where.bggId);
        if (!existing) {
          existing = { ...create };
          state.games.push(existing);
        } else {
          Object.assign(existing, update);
        }
        return existing;
      },
    },
  };
  return { db: () => client };
});

describe("Events management & attendance", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    const { eventRoutes } = await import("./events.js");
    app = Fastify();
    await eventRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    state.events = [];
    state.rsvps = [];
    state.currentUser = { id: "user-ricardo", displayName: "Ricardo" };
  });

  it("creates an event recording the creatorId and allowing creator to manage even if host is another user", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/groups/group-1/events",
      payload: {
        title: "Saturday Game Night",
        scheduledDate: "2026-11-20T19:00:00Z",
        hostUserId: "user-gogo", // host is gogo!
      },
    });

    expect(createRes.statusCode).toBe(201);
    const body = createRes.json();
    expect(body.event.creatorId).toBe("user-ricardo");
    expect(body.event.hostUserId).toBe("user-gogo");
    expect(body.event.canManage).toBe(true);

    // Creator can edit the event (change host or details)
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/events/${body.event.id}`,
      payload: {
        location: "Ricardo's Living Room",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().event.location).toBe("Ricardo's Living Room");

    // Creator can open voting even if host is another user
    const pollRes = await app.inject({
      method: "POST",
      url: `/v1/events/${body.event.id}/menu-poll/open`,
      payload: {
        options: [
          {
            id: "opt-1",
            title: "Euro Night",
            description: "Deep strategy",
            styleBadge: "Euro Night",
            totalEstimatedMinutes: 120,
            lineup: [],
          },
        ],
      },
    });
    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.json().event.menuPoll?.status).toBe("OPEN");
    expect(pollRes.json().event.canManage).toBe(true);

    // Creator can close the event and record who actually attended in exact sequence,
    // including a game added directly from BGG (bggId 999) that wasn't previously in DB
    const closeRes = await app.inject({
      method: "POST",
      url: `/v1/events/${body.event.id}/close`,
      payload: {
        playedBggIds: [13, 999, 42],
        attendedUserIds: ["user-ricardo", "user-gogo"],
      },
    });
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().event.status).toBe("COMPLETED");
    expect(closeRes.json().event.playedBggIds).toEqual([13, 999, 42]);
    // Played games preserves the exact specified sequence [13, 999, 42] and enriches game 999 from BGG
    expect(closeRes.json().event.playedGames.map((g: any) => g.bggId)).toEqual([13, 999, 42]);
    expect(closeRes.json().event.playedGames[1].name).toBe("Terraforming Mars");
    expect(closeRes.json().event.playedGames[1].coverUrl).toBe("/v1/covers/999");
    expect(closeRes.json().event.rsvps).toHaveLength(2);
    expect(closeRes.json().event.rsvps.every((r: any) => r.status === "ATTENDING")).toBe(true);
  });
});
