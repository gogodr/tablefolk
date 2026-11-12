import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { inviteLinkSchema } from "@tablefolk/contracts";
import { requireCreator, requireUser } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { audit } from "../lib/audit.js";
import { AppError, notFound } from "../lib/errors.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type LinkRecord = {
  id: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  joinCount: number;
};

function publicLink(link: LinkRecord) {
  return {
    id: link.id,
    status: link.revokedAt ? "REVOKED" : link.expiresAt && link.expiresAt <= new Date() ? "EXPIRED" : "ACTIVE",
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    joinCount: link.joinCount,
  };
}

export async function inviteLinkRoutes(app: FastifyInstance) {
  app.get("/v1/groups/:groupId/invite-links", async (request) => {
    const actor = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    await requireCreator(groupId, actor.id);
    const links = await db().groupInviteLink.findMany({ where: { groupId }, orderBy: { createdAt: "desc" } });
    return { links: links.map(publicLink) };
  });

  app.post("/v1/groups/:groupId/invite-links", async (request, reply) => {
    const actor = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    await requireCreator(groupId, actor.id);
    const { expiresAt: expiry } = inviteLinkSchema.parse(request.body);
    const expiresAt = expiry === null ? null : new Date(expiry);
    if (expiresAt && expiresAt <= new Date()) {
      throw new AppError(400, "INVALID_EXPIRY", "Choose a future expiration date and time.");
    }
    const token = randomBytes(32).toString("base64url");
    const link = await db().groupInviteLink.create({
      data: { groupId, creatorId: actor.id, tokenHash: hashToken(token), expiresAt },
    });
    audit("invite_link.created", { groupId, actorId: actor.id, linkId: link.id });
    return reply.code(201).send({
      link: publicLink(link),
      url: `${config.publicWebUrl.replace(/\/$/, "")}/join/${token}`,
    });
  });

  app.delete("/v1/groups/:groupId/invite-links/:linkId", async (request, reply) => {
    const actor = await requireUser(request);
    const { groupId, linkId } = request.params as { groupId: string; linkId: string };
    await requireCreator(groupId, actor.id);
    const updated = await db().groupInviteLink.updateMany({
      where: { id: linkId, groupId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!updated.count) {
      const link = await db().groupInviteLink.findFirst({ where: { id: linkId, groupId } });
      if (!link) throw notFound("Invite link not found");
    }
    audit("invite_link.revoked", { groupId, actorId: actor.id, linkId });
    return reply.code(204).send();
  });

  app.get("/v1/invite-links/:token", async (request) => {
    const { token } = request.params as { token: string };
    const link = await db().groupInviteLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { group: true } });
    if (!link) throw notFound("Invite link not found");
    return { groupName: link.group.name, status: publicLink(link).status, expiresAt: link.expiresAt?.toISOString() ?? null };
  });

  app.post("/v1/invite-links/:token/join", async (request) => {
    const actor = await requireUser(request);
    const { token } = request.params as { token: string };
    const link = await db().groupInviteLink.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!link) throw notFound("Invite link not found");
    const now = new Date();
    await db().$transaction(async (tx) => {
      const updated = await tx.groupInviteLink.updateMany({
        where: { id: link.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        data: { joinCount: { increment: 1 } },
      });
      if (updated.count !== 1) throw new AppError(409, "INVITE_CLOSED", "This invite link has expired or been revoked.");
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: link.groupId, userId: actor.id } },
        create: { groupId: link.groupId, userId: actor.id },
        update: {},
      });
    });
    audit("invite_link.joined", { groupId: link.groupId, actorId: actor.id, linkId: link.id });
    return { groupId: link.groupId };
  });
}
