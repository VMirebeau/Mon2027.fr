-- Rattrapage : tables et colonnes créées à l'époque hors migrations
-- (`prisma db push`), présentes dans dev.db et prod.db mais absentes de
-- l'historique. Sans cette migration, une base neuve construite par
-- `prisma migrate deploy` n'avait ni comptes joueurs ni sessions.
--
-- Bases EXISTANTES (dev.db, prod.db) : ne pas exécuter, marquer comme
-- appliquée (les tables y sont déjà) :
--   npx prisma migrate resolve --applied 20261107210000_rattrapage_comptes_joueurs
-- `python deploy.py migrate` le fait automatiquement pour la prod.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pseudo" TEXT NOT NULL,
    "displayPseudo" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSnapshot" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "blob" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_pseudo_key" ON "User"("pseudo");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AlterTable
ALTER TABLE "Defi" ADD COLUMN "title" TEXT;
ALTER TABLE "Defi" ADD COLUMN "creatorLevelRank" INTEGER;
