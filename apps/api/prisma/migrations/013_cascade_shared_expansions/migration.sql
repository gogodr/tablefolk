-- Cascade share existing owned expansions for already-shared base games
INSERT INTO "GroupShare" ("groupId", "userId", "bggId")
SELECT gs."groupId", ci."userId", ci."bggId"
FROM "GroupShare" gs
JOIN "Game" g_exp ON g_exp."baseGameBggId" = gs."bggId"
JOIN "CollectionItem" ci ON ci."userId" = gs."userId" AND ci."bggId" = g_exp."bggId"
ON CONFLICT ("groupId", "userId", "bggId") DO NOTHING;
