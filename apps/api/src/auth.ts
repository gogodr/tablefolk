import { clerkClient, getAuth } from "@clerk/fastify";
import type { FastifyRequest } from "fastify";
import { db } from "./db.js";
import { AppError, forbidden, notFound } from "./lib/errors.js";

export async function requireUser(request: FastifyRequest) {
  if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    throw new AppError(503, "AUTH_NOT_CONFIGURED", "Clerk is not configured for this API");
  }
  const auth = getAuth(request);
  if (!auth.isAuthenticated || !auth.userId) {
    if (request.headers.authorization?.startsWith("Bearer ")) {
      const candidate = auth.debug().reason;
      const reason = typeof candidate === "string" && /^[a-z-]{1,80}$/.test(candidate)
        ? candidate : "unknown";
      request.log.warn({ reason }, "Clerk rejected a bearer token");
    }
    throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue");
  }

  const existing = await db().user.findUnique({ where: { id: auth.userId } });
  if (existing) return existing;

  const clerkUser = await clerkClient.users.getUser(auth.userId);
  const email = clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)?.emailAddress
    ?? clerkUser.emailAddresses[0]?.emailAddress
    ?? "";
  const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ")
    || email.split("@")[0]
    || "Player";
  return db().user.upsert({
    where: { id: auth.userId },
    create: { id: auth.userId, email, displayName },
    update: {},
  });
}

export async function verifiedEmails(userId: string): Promise<string[]> {
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses
    .filter((entry) => entry.verification?.status === "verified")
    .map((entry) => entry.emailAddress.trim().toLowerCase());
}

export async function requireMember(groupId: string, userId: string) {
  const group = await db().group.findUnique({ where: { id: groupId } });
  if (!group) throw notFound("Group not found");
  const membership = await db().groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) throw forbidden();
  return group;
}

export async function requireCreator(groupId: string, userId: string) {
  const group = await requireMember(groupId, userId);
  if (group.creatorId !== userId) throw forbidden("Only the group creator can do that");
  return group;
}
