-- AlterTable
ALTER TABLE "agent_keys" ADD COLUMN     "claude_data_dirs" TEXT[] DEFAULT ARRAY['~/.claude/projects']::TEXT[],
ADD COLUMN     "exclude_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "last_known_version" TEXT;
