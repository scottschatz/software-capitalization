-- Prevent UPDATE and DELETE on immutable raw data tables
-- These tables are write-once, never modified (audit requirement)

CREATE OR REPLACE FUNCTION prevent_raw_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Immutability violation: % on table % is not allowed. Raw capture data is write-once.',
    TG_OP, TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- raw_sessions: immutable core fields, allow enrichment of enhanced Phase 5 fields
CREATE OR REPLACE FUNCTION prevent_raw_session_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Immutability violation: DELETE on raw_sessions is not allowed.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Block changes to any core field; only enhanced fields may be updated
    IF OLD.session_id IS DISTINCT FROM NEW.session_id
      OR OLD.developer_id IS DISTINCT FROM NEW.developer_id
      OR OLD.project_path IS DISTINCT FROM NEW.project_path
      OR OLD.started_at IS DISTINCT FROM NEW.started_at
      OR OLD.ended_at IS DISTINCT FROM NEW.ended_at
      OR OLD.duration_seconds IS DISTINCT FROM NEW.duration_seconds
      OR OLD.total_input_tokens IS DISTINCT FROM NEW.total_input_tokens
      OR OLD.total_output_tokens IS DISTINCT FROM NEW.total_output_tokens
      OR OLD.total_cache_read_tokens IS DISTINCT FROM NEW.total_cache_read_tokens
      OR OLD.total_cache_create_tokens IS DISTINCT FROM NEW.total_cache_create_tokens
      OR OLD.message_count IS DISTINCT FROM NEW.message_count
      OR OLD.tool_use_count IS DISTINCT FROM NEW.tool_use_count
      OR OLD.model IS DISTINCT FROM NEW.model
      OR OLD.raw_jsonl_path IS DISTINCT FROM NEW.raw_jsonl_path
      OR OLD.is_backfill IS DISTINCT FROM NEW.is_backfill
    THEN
      RAISE EXCEPTION 'Immutability violation: Only enhanced fields (tool_breakdown, files_referenced, user_prompt_count, first_user_prompt) can be updated on raw_sessions.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS raw_sessions_immutable ON raw_sessions;
CREATE TRIGGER raw_sessions_immutable
  BEFORE UPDATE OR DELETE ON raw_sessions
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_session_modification();

-- raw_tool_events: immutable
DROP TRIGGER IF EXISTS raw_tool_events_immutable ON raw_tool_events;
CREATE TRIGGER raw_tool_events_immutable
  BEFORE UPDATE OR DELETE ON raw_tool_events
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();

-- raw_commits: immutable
DROP TRIGGER IF EXISTS raw_commits_immutable ON raw_commits;
CREATE TRIGGER raw_commits_immutable
  BEFORE UPDATE OR DELETE ON raw_commits
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();

-- raw_vscode_activity: immutable
DROP TRIGGER IF EXISTS raw_vscode_activity_immutable ON raw_vscode_activity;
CREATE TRIGGER raw_vscode_activity_immutable
  BEFORE UPDATE OR DELETE ON raw_vscode_activity
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();

-- project_history: append-only audit log
DROP TRIGGER IF EXISTS project_history_immutable ON project_history;
CREATE TRIGGER project_history_immutable
  BEFORE UPDATE OR DELETE ON project_history
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();

-- daily_entry_revisions: append-only audit log
DROP TRIGGER IF EXISTS daily_entry_revisions_immutable ON daily_entry_revisions;
CREATE TRIGGER daily_entry_revisions_immutable
  BEFORE UPDATE OR DELETE ON daily_entry_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();
