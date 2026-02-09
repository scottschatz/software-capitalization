-- Create the function if it doesn't exist (needed for shadow database replay)
CREATE OR REPLACE FUNCTION prevent_raw_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Immutability violation: % on table % is not allowed. Raw capture data is write-once.',
    TG_OP, TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Prevent DELETE on daily_entries (entries may be updated through workflow, but never deleted)
DROP TRIGGER IF EXISTS daily_entries_no_delete ON daily_entries;
CREATE TRIGGER daily_entries_no_delete
  BEFORE DELETE ON daily_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();

-- Prevent DELETE on manual_entries (entries may be updated through workflow, but never deleted)
DROP TRIGGER IF EXISTS manual_entries_no_delete ON manual_entries;
CREATE TRIGGER manual_entries_no_delete
  BEFORE DELETE ON manual_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();

-- manual_entry_revisions: append-only audit log (prevent UPDATE and DELETE)
DROP TRIGGER IF EXISTS manual_entry_revisions_immutable ON manual_entry_revisions;
CREATE TRIGGER manual_entry_revisions_immutable
  BEFORE UPDATE OR DELETE ON manual_entry_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_modification();
