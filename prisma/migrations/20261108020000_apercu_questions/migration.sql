-- Aperçus jouables des questions (espace contributeurs → player /apercu/<id>).
-- CreateTable
CREATE TABLE "QuestionPreview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "QuestionPreview_expiresAt_idx" ON "QuestionPreview"("expiresAt");
