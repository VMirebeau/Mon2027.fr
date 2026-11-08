-- SQLite ALTER TABLE RENAME COLUMN is supported since SQLite 3.25 (2018).
-- Preserves data, no drop/recreate.
ALTER TABLE "Question" RENAME COLUMN "definition" TO "precisions";
