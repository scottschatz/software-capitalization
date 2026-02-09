-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "confirmation_method" TEXT;

-- AlterTable
ALTER TABLE "daily_entry_revisions" ADD COLUMN     "auth_method" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "abandoned_at" TIMESTAMP(3),
ADD COLUMN     "abandoned_reason" TEXT,
ADD COLUMN     "enhancement_classification" JSONB,
ADD COLUMN     "requires_manager_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspended_reason" TEXT;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
