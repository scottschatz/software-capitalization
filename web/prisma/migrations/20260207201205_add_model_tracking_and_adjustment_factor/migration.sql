-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "adjustment_factor" DOUBLE PRECISION,
ADD COLUMN     "hours_raw" DOUBLE PRECISION,
ADD COLUMN     "model_fallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "model_used" TEXT;

-- AlterTable
ALTER TABLE "developers" ADD COLUMN     "adjustment_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
