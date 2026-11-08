-- Ajoute deux colonnes sémantiques optionnelles à `Question` :
--
-- `miseEnPerspective` (TEXT, nullable) : 1 à 3 phrases courtes qui
--   contextualisent le chiffre (évolution depuis 1990, comparaison UE, etc.).
--   Affichée dans le dossier après le verdict. Optionnelle — les questions
--   sans perspective tombent sur l'affichage classique.
--
-- `indicators` (TEXT JSON, nullable) : 0 à 3 indicateurs transverses (parmi
--   precarite/inegalites/migration/insecurite/climat/ecole/sante/democratie/
--   logement) avec polarité ±1, stockés en JSON. Agrégés par
--   `computeIndicatorBiases` pour le portrait du joueur.
--
-- SQLite : ADD COLUMN nullable, pas besoin de RedefineTables.

ALTER TABLE "Question" ADD COLUMN "miseEnPerspective" TEXT;
ALTER TABLE "Question" ADD COLUMN "indicators" TEXT;
