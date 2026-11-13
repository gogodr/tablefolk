-- AlterTable
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "baseGameBggId" INTEGER;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "baseGameTitle" TEXT;

-- AlterTable
ALTER TABLE "CollectionItem" ADD COLUMN IF NOT EXISTS "maxPlayersOverride" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Game_baseGameBggId_idx" ON "Game"("baseGameBggId");
