-- AlterTable: move voting points and refill tracking from User to GroupMember (per-group wallet)
ALTER TABLE "GroupMember" ADD COLUMN IF NOT EXISTS "votingPoints" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "GroupMember" ADD COLUMN IF NOT EXISTS "lastPointsRefillAt" TIMESTAMP(3);

-- Preserve existing used points and refill timestamps per group membership
UPDATE "GroupMember" gm
SET
  "lastPointsRefillAt" = u."lastPointsRefillAt",
  "votingPoints" = GREATEST(
    5,
    COALESCE((
      SELECT SUM(gi."points")
      FROM "GameInterest" gi
      WHERE gi."groupId" = gm."groupId" AND gi."userId" = gm."userId"
    ), 0)
  )
FROM "User" u
WHERE u."id" = gm."userId";

-- Drop global columns from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "votingPoints";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastPointsRefillAt";
