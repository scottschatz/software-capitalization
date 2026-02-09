-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "developer_note" TEXT;

-- AlterTable
ALTER TABLE "system_settings" ALTER COLUMN "updated_at" DROP DEFAULT;
