-- Create sync_scheduler table to track automation runs
CREATE TABLE public.sync_scheduler (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'failed')),
    profiles_synced integer DEFAULT 0,
    total_profiles integer DEFAULT 10,
    run_duration_seconds integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_scheduler ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access (automation scripts need access)
CREATE POLICY "Allow public read access on sync_scheduler"
ON public.sync_scheduler FOR SELECT USING (true);

CREATE POLICY "Allow public insert access on sync_scheduler"
ON public.sync_scheduler FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access on sync_scheduler"
ON public.sync_scheduler FOR UPDATE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_sync_scheduler_updated_at
BEFORE UPDATE ON public.sync_scheduler
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial row
INSERT INTO public.sync_scheduler (status, total_profiles) VALUES ('idle', 10);