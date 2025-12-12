import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SchedulerStatus {
  id: string;
  last_run_at: string | null;
  next_run_at: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  profiles_synced: number;
  total_profiles: number;
  run_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export function useSchedulerStatus() {
  return useQuery({
    queryKey: ['scheduler-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_scheduler')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) throw error;
      return data as SchedulerStatus;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}