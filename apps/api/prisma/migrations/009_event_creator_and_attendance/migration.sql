-- AlterTable
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "creatorId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Event_creatorId_idx" ON "Event"("creatorId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Event_creatorId_fkey'
  ) THEN
    ALTER TABLE "Event" ADD CONSTRAINT "Event_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill creatorId for existing events using the earliest RSVP userId (who scheduled the event)
UPDATE "Event" e
SET "creatorId" = (
  SELECT r."userId"
  FROM "EventRsvp" r
  WHERE r."eventId" = e.id
  ORDER BY r."updatedAt" ASC
  LIMIT 1
)
WHERE e."creatorId" IS NULL;

-- If still null and group has creator, fallback to group creatorId
UPDATE "Event" e
SET "creatorId" = (
  SELECT g."creatorId"
  FROM "Group" g
  WHERE g.id = e."groupId"
)
WHERE e."creatorId" IS NULL;
