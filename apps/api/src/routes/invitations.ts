import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { inviteSchema } from "@tablefolk/contracts";
import { requireCreator, requireUser, verifiedEmails } from "../auth.js";
import { db } from "../db.js";
import { AppError, notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { sendInvitation } from "../services/mail.js";

const days = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

function publicInvitation(invite: { id: string; email: string; status: string; expiresAt: Date; createdAt: Date }) {
  return {
    id: invite.id,
    email: invite.email,
    status: invite.status === "PENDING" && invite.expiresAt < new Date() ? "EXPIRED" : invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

export async function invitationRoutes(app: FastifyInstance) {
  app.get("/v1/groups/:groupId/invitations", async (request) => {
    const actor = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    await requireCreator(groupId, actor.id);
    const invites = await db().invitation.findMany({ where: { groupId }, orderBy: { createdAt: "desc" } });
    return { invitations: invites.map(publicInvitation) };
  });

  app.post("/v1/groups/:groupId/invitations", async (request, reply) => {
    const actor = await requireUser(request);
    const { groupId } = request.params as { groupId: string };
    const group = await requireCreator(groupId, actor.id);
    const { email: rawEmail } = inviteSchema.parse(request.body);
    const email = rawEmail.trim().toLowerCase();
    const existing = await db().invitation.findFirst({
      where: { groupId, email, status: "PENDING", expiresAt: { gt: new Date() } },
    });
    if (existing) throw new AppError(409, "INVITE_PENDING", "An invitation is already pending for that email.");
    const token = newToken();
    const invite = await db().invitation.create({
      data: { groupId, email, inviterId: actor.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + days) },
    });
    try {
      await sendInvitation(email, group.name, token);
    } catch {
      await db().invitation.update({ where: { id: invite.id }, data: { status: "SEND_FAILED" } });
      audit("invite.send_failed", { groupId, actorId: actor.id, inviteId: invite.id });
      throw new AppError(502, "EMAIL_FAILED", "The invitation could not be sent. You can retry it from the invitations list.");
    }
    audit("invite.sent", { groupId, actorId: actor.id, inviteId: invite.id });
    return reply.code(201).send({ invitation: publicInvitation(invite) });
  });

  app.post("/v1/groups/:groupId/invitations/:invitationId/resend", async (request) => {
    const actor = await requireUser(request);
    const { groupId, invitationId } = request.params as { groupId: string; invitationId: string };
    const group = await requireCreator(groupId, actor.id);
    const invite = await db().invitation.findFirst({ where: { id: invitationId, groupId } });
    if (!invite) throw notFound("Invitation not found");
    if (invite.status === "ACCEPTED" || invite.status === "REVOKED") {
      throw new AppError(409, "INVITE_CLOSED", "This invitation can no longer be sent.");
    }
    const token = newToken();
    const updated = await db().invitation.update({
      where: { id: invite.id },
      data: { tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + days), status: "PENDING" },
    });
    try {
      await sendInvitation(invite.email, group.name, token);
    } catch {
      await db().invitation.update({ where: { id: invite.id }, data: { status: "SEND_FAILED" } });
      throw new AppError(502, "EMAIL_FAILED", "The invitation could not be sent. Try again later.");
    }
    audit("invite.resent", { groupId, actorId: actor.id, inviteId: invite.id });
    return { invitation: publicInvitation(updated) };
  });

  app.delete("/v1/groups/:groupId/invitations/:invitationId", async (request, reply) => {
    const actor = await requireUser(request);
    const { groupId, invitationId } = request.params as { groupId: string; invitationId: string };
    await requireCreator(groupId, actor.id);
    const invite = await db().invitation.findFirst({ where: { id: invitationId, groupId } });
    if (!invite) throw notFound("Invitation not found");
    if (invite.status === "ACCEPTED") throw new AppError(409, "INVITE_ACCEPTED", "This invitation has already been accepted.");
    await db().invitation.update({ where: { id: invite.id }, data: { status: "REVOKED" } });
    audit("invite.revoked", { groupId, actorId: actor.id, inviteId: invite.id });
    return reply.code(204).send();
  });

  app.get("/v1/invitations/:token", async (request) => {
    const { token } = request.params as { token: string };
    const invite = await db().invitation.findUnique({ where: { tokenHash: tokenHash(token) }, include: { group: true } });
    if (!invite) throw notFound("Invitation not found");
    return { groupName: invite.group.name, status: publicInvitation(invite).status, expiresAt: invite.expiresAt.toISOString() };
  });

  app.post("/v1/invitations/:token/accept", async (request) => {
    const actor = await requireUser(request);
    const { token } = request.params as { token: string };
    const invite = await db().invitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invite) throw notFound("Invitation not found");
    if (invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
      throw new AppError(409, "INVITE_CLOSED", "This invitation has expired or is no longer available.");
    }
    if (!(await verifiedEmails(actor.id)).includes(invite.email)) {
      throw new AppError(403, "EMAIL_MISMATCH", "Sign in with the email address that received this invitation.");
    }
    await db().$transaction(async (tx) => {
      const updated = await tx.invitation.updateMany({
        where: { id: invite.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (updated.count !== 1) throw new AppError(409, "INVITE_CLOSED", "This invitation is no longer available.");
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: invite.groupId, userId: actor.id } },
        create: { groupId: invite.groupId, userId: actor.id },
        update: {},
      });
    });
    audit("invite.accepted", { groupId: invite.groupId, actorId: actor.id, inviteId: invite.id });
    return { groupId: invite.groupId };
  });
}
