/*
  Warnings:

  - Added the required column `creatorAnswers` to the `Defi` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creatorScore` to the `Defi` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Defi" (
    "shortCode" TEXT NOT NULL PRIMARY KEY,
    "creatorUserId" TEXT,
    "creatorClientId" TEXT NOT NULL,
    "creatorPseudo" TEXT NOT NULL,
    "questionIds" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "themeId" TEXT,
    "creatorAnswers" TEXT NOT NULL,
    "creatorScore" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Defi_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Defi" ("createdAt", "creatorClientId", "creatorPseudo", "creatorUserId", "expiresAt", "questionIds", "shortCode", "source", "themeId") SELECT "createdAt", "creatorClientId", "creatorPseudo", "creatorUserId", "expiresAt", "questionIds", "shortCode", "source", "themeId" FROM "Defi";
DROP TABLE "Defi";
ALTER TABLE "new_Defi" RENAME TO "Defi";
CREATE INDEX "Defi_creatorUserId_idx" ON "Defi"("creatorUserId");
CREATE INDEX "Defi_creatorClientId_idx" ON "Defi"("creatorClientId");
CREATE INDEX "Defi_expiresAt_idx" ON "Defi"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
