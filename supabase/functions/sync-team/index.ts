import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TeamMember {
  name: string;
  email: string;
  role: string;
}

interface SyncPayload {
  teamName: string;
  members: TeamMember[];
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

    const payload: SyncPayload = await req.json();
    console.log('Received sync request for team:', payload.teamName);
    console.log('Members count:', payload.members.length);

    if (!payload.teamName || !payload.members || !Array.isArray(payload.members)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payload. Expected teamName and members array.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if team exists, if not create it
    let { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('name', payload.teamName)
      .maybeSingle();

    if (teamError) {
      console.error('Error fetching team:', teamError);
      throw teamError;
    }

    if (!team) {
      // Create new team
      const { data: newTeam, error: createError } = await supabase
        .from('teams')
        .insert({ name: payload.teamName, member_count: payload.members.length })
        .select()
        .single();

      if (createError) {
        console.error('Error creating team:', createError);
        throw createError;
      }
      team = newTeam;
      console.log('Created new team:', team.id);
    }

    // Delete existing members and insert new ones (full sync)
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', team.id);

    if (deleteError) {
      console.error('Error deleting old members:', deleteError);
      throw deleteError;
    }

    // Insert new members
    if (payload.members.length > 0) {
      const membersToInsert = payload.members.map(m => ({
        team_id: team.id,
        email: m.email,
        name: m.name || null,
        role: m.role || 'member',
      }));

      const { error: insertError } = await supabase
        .from('team_members')
        .insert(membersToInsert);

      if (insertError) {
        console.error('Error inserting members:', insertError);
        throw insertError;
      }
    }

    // Update team member count and last synced
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        member_count: payload.members.length,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', team.id);

    if (updateError) {
      console.error('Error updating team:', updateError);
      throw updateError;
    }

    // Add to sync history
    const { error: historyError } = await supabase
      .from('sync_history')
      .insert({
        team_id: team.id,
        member_count: payload.members.length,
      });

    if (historyError) {
      console.error('Error adding sync history:', historyError);
      // Non-critical, don't throw
    }

    console.log('Sync completed successfully for team:', team.name);

    return new Response(
      JSON.stringify({ 
        success: true, 
        teamId: team.id,
        memberCount: payload.members.length 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
