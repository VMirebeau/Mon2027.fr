-- Ajoute `amiUserId` (FK nullable vers User) à DefiResponse.
--
-- SetNull à la suppression du compte ami : on garde la réponse vivante pour
-- le créateur (l'historique du défi ne dépend pas de la persistance du compte
-- ami). Permet à un ami connecté de retrouver ses défis joués depuis n'importe
-- quel device, et sert au rétro-claim quand l'ami visite /resultats avec un
-- cookie pré-existant + une session nouvellement créée.
--
-- SQLite : ALTER TABLE ADD COLUMN supporte les FK nullable, mais Prisma
-- recommande le pattern RedefineTables pour les bases avec FK déjà actives
-- (PRAGMA foreign_keys=ON). On suit la convention des migrations précédentes.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DefiResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "defiShortCode" TEXT NOT NULL,
    "amiLabel" TEXT NOT NULL,
    "amiClientId" TEXT NOT NULL,
    "amiUserId" TEXT,
    "answers" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenByCreatorAt" DATETIME,
    CONSTRAINT "DefiResponse_defiShortCode_fkey" FOREIGN KEY ("defiShortCode") REFERENCES "Defi" ("shortCode") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DefiResponse_amiUserId_fkey" FOREIGN KEY ("amiUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DefiResponse" ("id", "defiShortCode", "amiLabel", "amiClientId", "answers", "score", "createdAt", "seenByCreatorAt") SELECT "id", "defiShortCode", "amiLabel", "amiClientId", "answers", "score", "createdAt", "seenByCreatorAt" FROM "DefiResponse";
DROP TABLE "DefiResponse";
ALTER TABLE "new_DefiResponse" RENAME TO "DefiResponse";
CREATE UNIQUE INDEX "DefiResponse_defiShortCode_amiClientId_key" ON "DefiResponse"("defiShortCode", "amiClientId");
CREATE INDEX "DefiResponse_defiShortCode_idx" ON "DefiResponse"("defiShortCode");
CREATE INDEX "DefiResponse_seenByCreatorAt_idx" ON "DefiResponse"("seenByCreatorAt");
CREATE INDEX "DefiResponse_amiUserId_idx" ON "DefiResponse"("amiUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
