-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "auto_discovered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monitored" BOOLEAN NOT NULL DEFAULT true;
