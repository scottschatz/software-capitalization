-- AlterTable
ALTER TABLE "raw_sessions" ADD COLUMN     "files_referenced" TEXT[],
ADD COLUMN     "first_user_prompt" TEXT,
ADD COLUMN     "tool_breakdown" JSONB,
ADD COLUMN     "user_prompt_count" INTEGER;

-- CreateTable
CREATE TABLE "raw_tool_events" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "project_path" TEXT,
    "tool_name" TEXT NOT NULL,
    "tool_input" JSONB,
    "tool_response" JSONB,
    "duration_ms" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_backfill" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_tool_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_tool_events_developer_id_timestamp_idx" ON "raw_tool_events"("developer_id", "timestamp");

-- CreateIndex
CREATE INDEX "raw_tool_events_session_id_idx" ON "raw_tool_events"("session_id");

-- CreateIndex
CREATE INDEX "raw_tool_events_tool_name_idx" ON "raw_tool_events"("tool_name");

-- AddForeignKey
ALTER TABLE "raw_tool_events" ADD CONSTRAINT "raw_tool_events_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
