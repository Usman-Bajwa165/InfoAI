/*
  Warnings:

  - You are about to drop the column `instructions` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "instructions";

-- CreateTable
CREATE TABLE "UserInstruction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInstruction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserInstruction" ADD CONSTRAINT "UserInstruction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
