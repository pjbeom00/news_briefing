-- CreateTable
CREATE TABLE "SavedQuery" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedQuery_pkey" PRIMARY KEY ("id")
);
