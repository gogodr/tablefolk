import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { config, requireSetting } from "./config.js";

let client: PrismaClient | undefined;
let migrationPromise: Promise<void> | null = null;

async function ensureSchemaUpdated(prisma: PrismaClient) {
  try {
    // 1. Column additions (IF NOT EXISTS)
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bggUsername" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastBggSyncAt" TIMESTAMP(3);`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "votingPoints" INTEGER NOT NULL DEFAULT 5;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS "versionName" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS "unavailableReason" TEXT;`);

    // 2. Tables creation (IF NOT EXISTS)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Event" (
        "id" TEXT NOT NULL,
        "groupId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "scheduledDate" TIMESTAMP(3) NOT NULL,
        "location" TEXT,
        "hostUserId" TEXT,
        "manualHeadcount" INTEGER,
        "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
        "officialPickBggId" INTEGER,
        "officialPickCarrier" TEXT,
        "officialLineup" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EventRsvp" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ATTENDING',
        "additionalGuests" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "GameInterest" (
        "id" TEXT NOT NULL,
        "groupId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "bggId" INTEGER NOT NULL,
        "points" INTEGER NOT NULL DEFAULT 1,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "GameInterest_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EventPick" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "bggId" INTEGER NOT NULL,
        "playerCount" INTEGER NOT NULL,
        "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EventPick_pkey" PRIMARY KEY ("id")
      );
    `);

    // 3. Unique indexes & foreign keys (idempotent)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Event_groupId_scheduledDate_idx" ON "Event"("groupId", "scheduledDate");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EventRsvp_eventId_userId_key" ON "EventRsvp"("eventId", "userId");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "GameInterest_groupId_userId_bggId_key" ON "GameInterest"("groupId", "userId", "bggId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GameInterest_groupId_bggId_idx" ON "GameInterest"("groupId", "bggId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EventPick_eventId_idx" ON "EventPick"("eventId");`);

    console.info("Database schema verified and up-to-date.");
  } catch (err) {
    console.warn("Auto-migration notice (schema may already be managed or restricted):", err);
  }
}

export function db(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({
      connectionString: requireSetting(config.databaseUrl, "DATABASE_URL"),
    });
    client = new PrismaClient({ adapter });
    if (!migrationPromise) {
      migrationPromise = ensureSchemaUpdated(client);
    }
  }
  return client;
}
