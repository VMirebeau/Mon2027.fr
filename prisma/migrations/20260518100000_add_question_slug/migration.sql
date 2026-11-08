-- AlterTable
ALTER TABLE "Question" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Question_slug_key" ON "Question"("slug");
