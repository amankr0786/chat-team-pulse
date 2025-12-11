-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  chatgpt_team_id TEXT,
  member_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, email)
);

-- Create sync_history table for tracking changes
CREATE TABLE public.sync_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (but make tables public for now since no auth)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;

-- Create public access policies (no auth required for MVP)
CREATE POLICY "Allow public read access on teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on teams" ON public.teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on teams" ON public.teams FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on teams" ON public.teams FOR DELETE USING (true);

CREATE POLICY "Allow public read access on team_members" ON public.team_members FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on team_members" ON public.team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on team_members" ON public.team_members FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on team_members" ON public.team_members FOR DELETE USING (true);

CREATE POLICY "Allow public read access on sync_history" ON public.sync_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on sync_history" ON public.sync_history FOR INSERT WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX idx_sync_history_team_id ON public.sync_history(team_id);
CREATE INDEX idx_sync_history_synced_at ON public.sync_history(synced_at DESC);