-- AlterTable
ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS "isStandalone" BOOLEAN NOT NULL DEFAULT false;
