-- Create table to track acknowledged team alerts
CREATE TABLE public.team_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  alert_type text NOT NULL DEFAULT 'member_limit',
  acknowledged_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_alerts ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on team_alerts"
ON public.team_alerts FOR SELECT
USING (true);

-- Allow public insert access
CREATE POLICY "Allow public insert access on team_alerts"
ON public.team_alerts FOR INSERT
WITH CHECK (true);

-- Allow public delete access
CREATE POLICY "Allow public delete access on team_alerts"
ON public.team_alerts FOR DELETE
USING (true);

-- Add unique constraint to prevent duplicate acknowledgments
CREATE UNIQUE INDEX team_alerts_team_id_type_idx ON public.team_alerts(team_id, alert_type);