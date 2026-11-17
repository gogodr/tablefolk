-- AlterTable EventRsvp: add guestNames array
ALTER TABLE "EventRsvp" ADD COLUMN IF NOT EXISTS "guestNames" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable Event: add confirmedGuestNames array
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "confirmedGuestNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
