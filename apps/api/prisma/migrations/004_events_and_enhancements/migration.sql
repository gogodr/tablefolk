-- AlterTable User
ALTER TABLE "User" ADD COLUMN "bggUsername" TEXT;
ALTER TABLE "User" ADD COLUMN "lastBggSyncAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "votingPoints" INTEGER NOT NULL DEFAULT 5;

-- AlterTable Game
ALTER TABLE "Game" ADD COLUMN "weight" DOUBLE PRECISION;

-- AlterTable CollectionItem
ALTER TABLE "CollectionItem" ADD COLUMN "versionName" TEXT;
ALTER TABLE "CollectionItem" ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CollectionItem" ADD COLUMN "unavailableReason" TEXT;

-- CreateTable Event
CREATE TABLE "Event" (
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
    "officialLineup" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventRsvp
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATTENDING',
    "additionalGuests" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable GameInterest
CREATE TABLE "GameInterest" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bggId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable EventPick
CREATE TABLE "EventPick" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bggId" INTEGER NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventPick_pkey" PRIMARY KEY ("id")
);

-- Indexes and Constraints for Event
CREATE INDEX "Event_groupId_scheduledDate_idx" ON "Event"("groupId", "scheduledDate");
ALTER TABLE "Event" ADD CONSTRAINT "Event_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_officialPickBggId_fkey" FOREIGN KEY ("officialPickBggId") REFERENCES "Game"("bggId") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes and Constraints for EventRsvp
CREATE UNIQUE INDEX "EventRsvp_eventId_userId_key" ON "EventRsvp"("eventId", "userId");
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes and Constraints for GameInterest
CREATE UNIQUE INDEX "GameInterest_groupId_userId_bggId_key" ON "GameInterest"("groupId", "userId", "bggId");
CREATE INDEX "GameInterest_groupId_bggId_idx" ON "GameInterest"("groupId", "bggId");
ALTER TABLE "GameInterest" ADD CONSTRAINT "GameInterest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameInterest" ADD CONSTRAINT "GameInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameInterest" ADD CONSTRAINT "GameInterest_bggId_fkey" FOREIGN KEY ("bggId") REFERENCES "Game"("bggId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes and Constraints for EventPick
CREATE INDEX "EventPick_eventId_idx" ON "EventPick"("eventId");
ALTER TABLE "EventPick" ADD CONSTRAINT "EventPick_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventPick" ADD CONSTRAINT "EventPick_bggId_fkey" FOREIGN KEY ("bggId") REFERENCES "Game"("bggId") ON DELETE RESTRICT ON UPDATE CASCADE;
