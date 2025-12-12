import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SchedulerPayload {
  status: 'idle' | 'running' | 'completed' | 'failed';
  last_run_at?: string;
  next_run_at?: string;
  profiles_synced?: number;
  total_profiles?: number;
  run_duration_seconds?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'GET') {
      // Fetch current scheduler status
      const { data, error } = await supabase
        .from('sync_scheduler')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching scheduler status:', error);
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const payload: SchedulerPayload = await req.json();
      console.log('Updating scheduler status:', payload);

      // Get the existing scheduler record
      const { data: existing, error: fetchError } = await supabase
        .from('sync_scheduler')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) {
        console.error('Error fetching existing scheduler:', fetchError);
        throw fetchError;
      }

      // Update the scheduler status
      const updateData: Record<string, unknown> = {
        status: payload.status,
      };

      if (payload.last_run_at) updateData.last_run_at = payload.last_run_at;
      if (payload.next_run_at) updateData.next_run_at = payload.next_run_at;
      if (payload.profiles_synced !== undefined) updateData.profiles_synced = payload.profiles_synced;
      if (payload.total_profiles !== undefined) updateData.total_profiles = payload.total_profiles;
      if (payload.run_duration_seconds !== undefined) updateData.run_duration_seconds = payload.run_duration_seconds;

      const { data, error: updateError } = await supabase
        .from('sync_scheduler')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating scheduler status:', updateError);
        throw updateError;
      }

      console.log('Scheduler status updated:', data);

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Scheduler status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});