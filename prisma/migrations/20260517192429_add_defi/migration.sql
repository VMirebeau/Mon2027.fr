-- Note : User, Session, UserSnapshot existaient déjà dans la base de dev
-- (créés via `prisma db push` à l'époque, sans migration formelle). On évite
-- de les recréer ici pour ne pas planter sur les conflits.

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Defi" (
    "shortCode" TEXT NOT NULL PRIMARY KEY,
    "creatorUserId" TEXT,
    "creatorClientId" TEXT NOT NULL,
    "creatorPseudo" TEXT NOT NULL,
    "questionIds" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "themeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Defi_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DefiResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "defiShortCode" TEXT NOT NULL,
    "amiLabel" TEXT NOT NULL,
    "amiClientId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DefiResponse_defiShortCode_fkey" FOREIGN KEY ("defiShortCode") REFERENCES "Defi" ("shortCode") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Defi_creatorUserId_idx" ON "Defi"("creatorUserId");

-- CreateIndex
CREATE INDEX "Defi_creatorClientId_idx" ON "Defi"("creatorClientId");

-- CreateIndex
CREATE INDEX "Defi_expiresAt_idx" ON "Defi"("expiresAt");

-- CreateIndex
CREATE INDEX "DefiResponse_defiShortCode_idx" ON "DefiResponse"("defiShortCode");

-- CreateIndex
CREATE UNIQUE INDEX "DefiResponse_defiShortCode_amiClientId_key" ON "DefiResponse"("defiShortCode", "amiClientId");
