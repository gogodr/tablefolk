CREATE TABLE "GroupInviteLink" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "joinCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupInviteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupInviteLink_tokenHash_key" ON "GroupInviteLink"("tokenHash");
CREATE INDEX "GroupInviteLink_groupId_createdAt_idx" ON "GroupInviteLink"("groupId", "createdAt");
ALTER TABLE "GroupInviteLink" ADD CONSTRAINT "GroupInviteLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupInviteLink" ADD CONSTRAINT "GroupInviteLink_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
