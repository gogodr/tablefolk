-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastPointsRefillAt" TIMESTAMP(3);
