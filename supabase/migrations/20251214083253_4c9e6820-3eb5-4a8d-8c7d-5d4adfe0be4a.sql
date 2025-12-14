-- 1) Add new columns
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS workspace_id text,
  ADD COLUMN IF NOT EXISTS organization_id text,
  ADD COLUMN IF NOT EXISTS owner_email text;

-- 2) Make workspace_id unique when present
CREATE UNIQUE INDEX IF NOT EXISTS teams_workspace_id_key
  ON public.teams (workspace_id)
  WHERE workspace_id IS NOT NULL;