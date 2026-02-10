-- AlterTable
ALTER TABLE "agent_keys" ADD COLUMN     "discovered_paths" JSONB,
ADD COLUMN     "hooks_installed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "last_reported_at" TIMESTAMP(3),
ADD COLUMN     "os_info" TEXT,
ADD COLUMN     "sync_schedule_weekday" TEXT,
ADD COLUMN     "sync_schedule_weekend" TEXT;
