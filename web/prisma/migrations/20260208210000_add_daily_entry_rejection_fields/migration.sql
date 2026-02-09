-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN "rejected_by_id" TEXT;
ALTER TABLE "daily_entries" ADD COLUMN "rejected_at" TIMESTAMP(3);
ALTER TABLE "daily_entries" ADD COLUMN "rejection_reason" TEXT;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
