import type { FastifyInstance } from "fastify";
import {
  eventCreateSchema,
  eventUpdateSchema,
  eventRsvpSchema,
  eventAttendanceSchema,
  eventSetOfficialSchema,
} from "@tablefolk/contracts";
import { Prisma } from "../../generated/prisma/client.js";
import { requireUser } from "../../auth.js";
import { db } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
import { gameDto } from "../../lib/serialize.js";
import { canManageEvent, eventInclude, serializeEventDetail } from "./shared.js";

export async function eventCrudRoutes(app: FastifyInstance) {
  app.get("/v1/events", async (request) => {
    const user = await requireUser(request);

    const memberships = await db().groupMember.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    if (groupIds.length === 0) {
      return { events: [] };
    }

    const events = await db().event.findMany({
      where: { groupId: { in: groupIds } },
      include: eventInclude,
      orderBy: { scheduledDate: "asc" },
    });

    const serialized = await Promise.all(events.map((e) => serializeEventDetail(e, user.id)));
    return { events: serialized };
  });

  app.get("/v1/groups/:groupId/events", async (request) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const events = await db().event.findMany({
      where: { groupId },
      include: eventInclude,
      orderBy: { scheduledDate: "asc" },
    });

    const serialized = await Promise.all(events.map((e) => serializeEventDetail(e, user.id)));
    return { events: serialized };
  });

  app.post("/v1/groups/:groupId/events", async (request, reply) => {
    const user = await requireUser(request);
    const { groupId } = request.params as { groupId: string };

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = eventCreateSchema.parse(request.body);

    const event = await db().event.create({
      data: {
        groupId,
        creatorId: user.id,
        title: body.title,
        description: body.description ?? null,
        scheduledDate: new Date(body.scheduledDate),
        location: body.location ?? null,
        hostUserId: body.hostUserId ?? null,
        manualHeadcount: body.manualHeadcount ?? null,
        rsvps: {
          create: {
            userId: user.id,
            status: "ATTENDING",
            additionalGuests: 0,
          },
        },
      },
      include: eventInclude,
    });

    return reply.code(201).send({
      event: await serializeEventDetail(event, user.id),
    });
  });

  app.get("/v1/events/:eventId", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    return { event: await serializeEventDetail(event, user.id) };
  });

  app.patch("/v1/events/:eventId", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    if (!canManageEvent(event, user.id)) {
      throw forbidden("Only the event creator, host, or group creator can edit this event.");
    }

    const body = eventUpdateSchema.parse(request.body);

    const updated = await db().event.update({
      where: { id: eventId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.scheduledDate !== undefined ? { scheduledDate: new Date(body.scheduledDate) } : {}),
        ...(body.location !== undefined ? { location: body.location ?? null } : {}),
        ...(body.hostUserId !== undefined ? { hostUserId: body.hostUserId ?? null } : {}),
        ...(body.creatorId !== undefined ? { creatorId: body.creatorId ?? null } : {}),
        ...(body.manualHeadcount !== undefined ? { manualHeadcount: body.manualHeadcount ?? null } : {}),
      },
      include: eventInclude,
    });

    return { event: await serializeEventDetail(updated, user.id) };
  });

  app.put("/v1/events/:eventId/attendance", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    if (!canManageEvent(event, user.id)) {
      throw forbidden("Only the event creator, host, or group creator can manage attendance.");
    }

    const body = eventAttendanceSchema.parse(request.body);

    for (const rsvp of body.rsvps) {
      const guestNames = (rsvp.guestNames ?? []).filter((name) => name.trim().length > 0);
      const additionalGuests = guestNames.length > 0 ? guestNames.length : rsvp.additionalGuests;
      await db().eventRsvp.upsert({
        where: { eventId_userId: { eventId, userId: rsvp.userId } },
        create: {
          eventId,
          userId: rsvp.userId,
          status: rsvp.status,
          additionalGuests,
          guestNames,
        },
        update: {
          status: rsvp.status,
          additionalGuests,
          guestNames,
        },
      });
    }

    const updated = await db().event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });

    return { event: await serializeEventDetail(updated!, user.id) };
  });

  app.post("/v1/events/:eventId/rsvp", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({ where: { id: eventId } });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    const body = eventRsvpSchema.parse(request.body);
    const guestNames = (body.guestNames ?? []).filter((name) => name.trim().length > 0);
    const additionalGuests = guestNames.length > 0 ? guestNames.length : body.additionalGuests;

    const rsvp = await db().eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      create: {
        eventId,
        userId: user.id,
        status: body.status,
        additionalGuests,
        guestNames,
      },
      update: {
        status: body.status,
        additionalGuests,
        guestNames,
      },
    });

    return { rsvp };
  });

  app.put("/v1/events/:eventId/official", async (request) => {
    const user = await requireUser(request);
    const { eventId } = request.params as { eventId: string };

    const event = await db().event.findUnique({
      where: { id: eventId },
      include: { group: true },
    });
    if (!event) throw notFound("Event not found");

    const member = await db().groupMember.findUnique({
      where: { groupId_userId: { groupId: event.groupId, userId: user.id } },
    });
    if (!member) throw forbidden("You are not a member of this group.");

    if (!canManageEvent(event, user.id)) {
      throw forbidden("Only the event creator, host, or group creator can announce the official selection.");
    }

    const body = eventSetOfficialSchema.parse(request.body);

    if (body.type === "clear") {
      await db().event.update({
        where: { id: eventId },
        data: {
          officialPickBggId: null,
          officialPickCarrier: null,
          officialLineup: Prisma.DbNull,
        },
      });
      return { success: true, officialPickBggId: null, officialPickCarrier: null, officialLineup: null };
    }

    if (body.type === "single") {
      if (!body.bggId) throw new AppError(400, "VALIDATION_ERROR", "bggId is required for single official pick.");
      const updated = await db().event.update({
        where: { id: eventId },
        data: {
          officialPickBggId: body.bggId,
          officialPickCarrier: body.carrierDisplayName ?? null,
          officialLineup: Prisma.DbNull,
        },
        include: { officialPick: true },
      });
      return {
        success: true,
        officialPickBggId: updated.officialPickBggId,
        officialPick: updated.officialPick ? gameDto(updated.officialPick) : null,
        officialPickCarrier: updated.officialPickCarrier ?? null,
        officialLineup: null,
      };
    }

    if (body.type === "lineup") {
      if (!body.lineup || body.lineup.length === 0) {
        throw new AppError(400, "VALIDATION_ERROR", "lineup is required for lineup official pick.");
      }
      const updated = await db().event.update({
        where: { id: eventId },
        data: {
          officialPickBggId: null,
          officialPickCarrier: null,
          officialLineup: body.lineup as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        success: true,
        officialPickBggId: null,
        officialPick: null,
        officialPickCarrier: null,
        officialLineup: updated.officialLineup,
      };
    }

    return { success: true };
  });
}
