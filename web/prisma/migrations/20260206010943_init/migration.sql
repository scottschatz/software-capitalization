-- CreateTable
CREATE TABLE "developers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "azure_oid" TEXT,
    "role" TEXT NOT NULL DEFAULT 'developer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "email_verified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "developers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "agent_keys" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "machine_name" TEXT,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_sessions" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "project_path" TEXT NOT NULL,
    "git_branch" TEXT,
    "claude_version" TEXT,
    "slug" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "total_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_output_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_cache_create_tokens" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "tool_use_count" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "raw_jsonl_path" TEXT,
    "is_backfill" BOOLEAN NOT NULL DEFAULT false,
    "sync_log_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_commits" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "repo_path" TEXT NOT NULL,
    "branch" TEXT,
    "author_name" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "committed_at" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "files_changed" INTEGER NOT NULL DEFAULT 0,
    "insertions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "is_backfill" BOOLEAN NOT NULL DEFAULT false,
    "sync_log_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_vscode_activity" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "project_name" TEXT NOT NULL,
    "language" TEXT,
    "duration_minutes" DOUBLE PRECISION NOT NULL,
    "editor" TEXT NOT NULL DEFAULT 'vscode',
    "is_backfill" BOOLEAN NOT NULL DEFAULT false,
    "sync_log_id" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_vscode_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sync_log" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "agent_key_id" TEXT NOT NULL,
    "sync_type" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "sessions_count" INTEGER NOT NULL DEFAULT 0,
    "commits_count" INTEGER NOT NULL DEFAULT 0,
    "vscode_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "from_date" TIMESTAMP(3),
    "to_date" TIMESTAMP(3),

    CONSTRAINT "agent_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "business_justification" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'application_development',
    "management_authorized" BOOLEAN NOT NULL DEFAULT false,
    "authorization_date" DATE,
    "authorization_evidence" TEXT,
    "probable_to_complete" BOOLEAN NOT NULL DEFAULT true,
    "development_uncertainty" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'active',
    "expected_completion" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_repos" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "repo_path" TEXT NOT NULL,
    "repo_url" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_claude_paths" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "claude_path" TEXT NOT NULL,
    "local_path" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_claude_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_history" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_change_requests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "current_phase" TEXT NOT NULL,
    "requested_phase" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entries" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "project_id" TEXT,
    "hours_estimated" DOUBLE PRECISION,
    "phase_auto" TEXT,
    "description_auto" TEXT,
    "source_session_ids" TEXT[],
    "source_commit_ids" TEXT[],
    "hours_confirmed" DOUBLE PRECISION,
    "phase_confirmed" TEXT,
    "description_confirmed" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "adjustment_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_entries" (
    "id" TEXT NOT NULL,
    "developer_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "project_id" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "phase" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entry_revisions" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_entry_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "action_token" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_replies" (
    "id" TEXT NOT NULL,
    "email_log_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_body" TEXT,
    "ai_interpretation" TEXT,
    "action_taken" TEXT,
    "confirmation_sent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "email_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "total_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capitalizable_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expensed_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "report_data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generated_by_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "developers_email_key" ON "developers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "developers_azure_oid_key" ON "developers"("azure_oid");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "agent_keys_key_hash_key" ON "agent_keys"("key_hash");

-- CreateIndex
CREATE INDEX "raw_sessions_developer_id_started_at_idx" ON "raw_sessions"("developer_id", "started_at");

-- CreateIndex
CREATE INDEX "raw_sessions_project_path_idx" ON "raw_sessions"("project_path");

-- CreateIndex
CREATE UNIQUE INDEX "raw_sessions_developer_id_session_id_key" ON "raw_sessions"("developer_id", "session_id");

-- CreateIndex
CREATE INDEX "raw_commits_developer_id_committed_at_idx" ON "raw_commits"("developer_id", "committed_at");

-- CreateIndex
CREATE INDEX "raw_commits_repo_path_idx" ON "raw_commits"("repo_path");

-- CreateIndex
CREATE UNIQUE INDEX "raw_commits_commit_hash_repo_path_key" ON "raw_commits"("commit_hash", "repo_path");

-- CreateIndex
CREATE INDEX "raw_vscode_activity_developer_id_date_idx" ON "raw_vscode_activity"("developer_id", "date");

-- CreateIndex
CREATE INDEX "agent_sync_log_developer_id_started_at_idx" ON "agent_sync_log"("developer_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_repos_project_id_repo_path_key" ON "project_repos"("project_id", "repo_path");

-- CreateIndex
CREATE UNIQUE INDEX "project_claude_paths_project_id_claude_path_key" ON "project_claude_paths"("project_id", "claude_path");

-- CreateIndex
CREATE INDEX "project_history_project_id_changed_at_idx" ON "project_history"("project_id", "changed_at");

-- CreateIndex
CREATE INDEX "phase_change_requests_project_id_status_idx" ON "phase_change_requests"("project_id", "status");

-- CreateIndex
CREATE INDEX "daily_entries_date_idx" ON "daily_entries"("date");

-- CreateIndex
CREATE INDEX "daily_entries_status_idx" ON "daily_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entries_developer_id_date_project_id_key" ON "daily_entries"("developer_id", "date", "project_id");

-- CreateIndex
CREATE INDEX "manual_entries_developer_id_date_idx" ON "manual_entries"("developer_id", "date");

-- CreateIndex
CREATE INDEX "daily_entry_revisions_entry_id_idx" ON "daily_entry_revisions"("entry_id");

-- CreateIndex
CREATE INDEX "email_log_recipient_id_sent_at_idx" ON "email_log"("recipient_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_project_id_year_month_key" ON "monthly_reports"("project_id", "year", "month");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_sessions" ADD CONSTRAINT "raw_sessions_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_sessions" ADD CONSTRAINT "raw_sessions_sync_log_id_fkey" FOREIGN KEY ("sync_log_id") REFERENCES "agent_sync_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_commits" ADD CONSTRAINT "raw_commits_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_commits" ADD CONSTRAINT "raw_commits_sync_log_id_fkey" FOREIGN KEY ("sync_log_id") REFERENCES "agent_sync_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_vscode_activity" ADD CONSTRAINT "raw_vscode_activity_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_vscode_activity" ADD CONSTRAINT "raw_vscode_activity_sync_log_id_fkey" FOREIGN KEY ("sync_log_id") REFERENCES "agent_sync_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sync_log" ADD CONSTRAINT "agent_sync_log_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sync_log" ADD CONSTRAINT "agent_sync_log_agent_key_id_fkey" FOREIGN KEY ("agent_key_id") REFERENCES "agent_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_claude_paths" ADD CONSTRAINT "project_claude_paths_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_change_requests" ADD CONSTRAINT "phase_change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_change_requests" ADD CONSTRAINT "phase_change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_change_requests" ADD CONSTRAINT "phase_change_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entry_revisions" ADD CONSTRAINT "daily_entry_revisions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "daily_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entry_revisions" ADD CONSTRAINT "daily_entry_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_email_log_id_fkey" FOREIGN KEY ("email_log_id") REFERENCES "email_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
