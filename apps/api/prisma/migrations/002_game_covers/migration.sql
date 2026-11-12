CREATE TABLE "GameCover" (
    "bggId" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "GameCover_pkey" PRIMARY KEY ("bggId")
);

ALTER TABLE "GameCover" ADD CONSTRAINT "GameCover_bggId_fkey" FOREIGN KEY ("bggId") REFERENCES "Game"("bggId") ON DELETE CASCADE ON UPDATE CASCADE;
