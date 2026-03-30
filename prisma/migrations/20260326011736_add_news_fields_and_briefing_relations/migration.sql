/*
  Warnings:

  - A unique constraint covering the columns `[link]` on the table `News` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `News` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Briefing" ADD COLUMN     "categoryTag" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentTo" TEXT;

-- AlterTable
ALTER TABLE "News" ADD COLUMN     "sourceQuery" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "BriefingItem" (
    "id" SERIAL NOT NULL,
    "briefingId" INTEGER NOT NULL,
    "newsId" INTEGER NOT NULL,
    "rankOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BriefingItem_briefingId_idx" ON "BriefingItem"("briefingId");

-- CreateIndex
CREATE INDEX "BriefingItem_newsId_idx" ON "BriefingItem"("newsId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingItem_briefingId_newsId_key" ON "BriefingItem"("briefingId", "newsId");

-- CreateIndex
CREATE UNIQUE INDEX "News_link_key" ON "News"("link");

-- AddForeignKey
ALTER TABLE "BriefingItem" ADD CONSTRAINT "BriefingItem_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingItem" ADD CONSTRAINT "BriefingItem_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "News"("id") ON DELETE CASCADE ON UPDATE CASCADE;
