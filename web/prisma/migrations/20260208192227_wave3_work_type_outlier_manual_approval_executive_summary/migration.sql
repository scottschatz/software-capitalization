/*
  Warnings:

  - Added the required column `updated_at` to the `manual_entries` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "outlier_flag" TEXT,
ADD COLUMN     "work_type" TEXT;

-- AlterTable
ALTER TABLE "manual_entries" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by_id" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'confirmed',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "phase" SET DEFAULT 'preliminary';

-- CreateTable
CREATE TABLE "manual_entry_revisions" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "auth_method" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_entry_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_executive_summaries" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "report_data" JSONB NOT NULL,
    "model_used" TEXT,
    "model_fallback" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generated_by_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_executive_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_entry_revisions_entry_id_idx" ON "manual_entry_revisions"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_executive_summaries_year_month_key" ON "monthly_executive_summaries"("year", "month");

-- CreateIndex
CREATE INDEX "manual_entries_status_idx" ON "manual_entries"("status");

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entry_revisions" ADD CONSTRAINT "manual_entry_revisions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "manual_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entry_revisions" ADD CONSTRAINT "manual_entry_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_executive_summaries" ADD CONSTRAINT "monthly_executive_summaries_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
