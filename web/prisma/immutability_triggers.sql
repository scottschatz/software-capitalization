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

-- raw_sessions: immutable
DROP TRIGGER IF EXISTS raw_sessions_immutable ON raw_sessions;
CREATE TRIGGER raw_sessions_immutable
  BEFORE UPDATE OR DELETE ON raw_sessions
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
