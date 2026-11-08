-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customId" TEXT,
    "theme" TEXT NOT NULL,
    "sousTheme" TEXT,
    "format" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "sensibilite" TEXT NOT NULL DEFAULT 'standard',
    "difficulte" INTEGER NOT NULL DEFAULT 3,
    "question" TEXT NOT NULL,
    "definition" TEXT,
    "explication" TEXT NOT NULL,
    "contextePedagogique" TEXT,
    "unite" TEXT,
    "plageMin" REAL,
    "plageMax" REAL,
    "reponseNumerique" REAL,
    "toleranceVerte" REAL,
    "toleranceOrange" REAL,
    "payload" TEXT,
    "dateDonnee" INTEGER,
    "auteur" TEXT NOT NULL,
    "valideurs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "dateValidation" DATETIME,
    "datePublication" DATETIME
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'primaire',
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "questionId" TEXT NOT NULL,
    CONSTRAINT "Source_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_customId_key" ON "Question"("customId");

-- CreateIndex
CREATE INDEX "Question_theme_idx" ON "Question"("theme");

-- CreateIndex
CREATE INDEX "Question_statut_idx" ON "Question"("statut");

-- CreateIndex
CREATE INDEX "Question_sensibilite_idx" ON "Question"("sensibilite");

-- CreateIndex
CREATE INDEX "Source_questionId_idx" ON "Source"("questionId");
