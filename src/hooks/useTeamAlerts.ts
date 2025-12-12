import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TeamAlert {
  id: string;
  team_id: string;
  alert_type: string;
  acknowledged_at: string;
  created_at: string;
}

export function useTeamAlerts() {
  return useQuery({
    queryKey: ['team-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_alerts')
        .select('*');
      
      if (error) throw error;
      return data as TeamAlert[];
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ teamId, alertType }: { teamId: string; alertType: string }) => {
      const { data, error } = await supabase
        .from('team_alerts')
        .insert({ team_id: teamId, alert_type: alertType })
        .select()
        .single();
      
      if (error) throw error;
      return data as TeamAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-alerts'] });
    },
  });
}
