-- Fix drift: daily_breakdown column and ended_at index already exist in DB
-- from previous direct application. Using IF NOT EXISTS to be idempotent.

-- Add daily_breakdown to raw_sessions (if not already present from drift)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'raw_sessions' AND column_name = 'daily_breakdown'
  ) THEN
    ALTER TABLE "raw_sessions" ADD COLUMN "daily_breakdown" JSONB;
  END IF;
END $$;

-- Add index on (developer_id, ended_at) for raw_sessions (if not already present)
CREATE INDEX IF NOT EXISTS "raw_sessions_developer_id_ended_at_idx"
  ON "raw_sessions"("developer_id", "ended_at");

-- ============================================================
-- Phase 6: Project Lifecycle & Enhancement Projects
-- ============================================================

-- Add lifecycle date fields to projects
ALTER TABLE "projects" ADD COLUMN "go_live_date" DATE;
ALTER TABLE "projects" ADD COLUMN "phase_effective_date" DATE;

-- Add enhancement project support (self-referential FK)
ALTER TABLE "projects" ADD COLUMN "parent_project_id" TEXT;
ALTER TABLE "projects" ADD COLUMN "enhancement_label" TEXT;
ALTER TABLE "projects" ADD COLUMN "enhancement_number" INTEGER;

-- Index for finding enhancement projects by parent
CREATE INDEX "projects_parent_project_id_idx" ON "projects"("parent_project_id");

-- Foreign key: parent project self-reference
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_parent_project_id_fkey"
  FOREIGN KEY ("parent_project_id")
  REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
