import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TeamMember {
  name: string;
  email: string;
  role: string;
  joined_at?: string | null;
}

interface SyncPayload {
  teamName: string;
  workspaceId?: string | null;
  organizationId?: string | null;
  ownerEmail?: string | null;
  members: TeamMember[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    console.log('=== sync-team request body ===');
    console.log(rawBody);

    let payload: SyncPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payload || !Array.isArray(payload.members) || payload.members.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No members provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();

    // 1) Resolve or create team by workspaceId (preferred) or name (fallback)
    let teamId: string | null = null;

    if (payload.workspaceId) {
      // Try existing team by workspace_id
      const { data: existingByWs, error: wsError } = await supabase
        .from('teams')
        .select('*')
        .eq('workspace_id', payload.workspaceId)
        .maybeSingle();

      if (wsError) {
        console.error('Error fetching team by workspace_id:', wsError);
        return new Response(
          JSON.stringify({ success: false, error: wsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existingByWs) {
        // Update existing team
        const { data: updated, error: updateError } = await supabase
          .from('teams')
          .update({
            name: payload.teamName || existingByWs.name,
            workspace_id: payload.workspaceId,
            organization_id: payload.organizationId ?? existingByWs.organization_id,
            owner_email: payload.ownerEmail ?? existingByWs.owner_email,
            member_count: payload.members.length,
            last_synced_at: now,
          })
          .eq('id', existingByWs.id)
          .select('id')
          .single();

        if (updateError) {
          console.error('Error updating team:', updateError);
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        teamId = updated.id;
      } else {
        // Insert new team with workspace_id
        const { data: inserted, error: insertError } = await supabase
          .from('teams')
          .insert({
            name: payload.teamName || 'Unknown Team',
            workspace_id: payload.workspaceId,
            organization_id: payload.organizationId ?? null,
            owner_email: payload.ownerEmail ?? null,
            member_count: payload.members.length,
            last_synced_at: now,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('Error inserting team:', insertError);
          return new Response(
            JSON.stringify({ success: false, error: insertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        teamId = inserted.id;
      }
    } else {
      // Fallback: legacy behavior by name (no workspaceId)
      const { data: existingByName, error: nameError } = await supabase
        .from('teams')
        .select('*')
        .eq('name', payload.teamName)
        .maybeSingle();

      if (nameError) {
        console.error('Error fetching team by name:', nameError);
        return new Response(
          JSON.stringify({ success: false, error: nameError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existingByName) {
        const { data: updated, error: updateError } = await supabase
          .from('teams')
          .update({
            member_count: payload.members.length,
            last_synced_at: now,
          })
          .eq('id', existingByName.id)
          .select('id')
          .single();

        if (updateError) {
          console.error('Error updating team (name fallback):', updateError);
          return new Response(
            JSON.stringify({ success: false, error: updateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        teamId = updated.id;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('teams')
          .insert({
            name: payload.teamName || 'Unknown Team',
            member_count: payload.members.length,
            last_synced_at: now,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('Error inserting team (name fallback):', insertError);
          return new Response(
            JSON.stringify({ success: false, error: insertError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        teamId = inserted.id;
      }
    }

    if (!teamId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to resolve team id' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2) Replace existing team members with new list
    const members = payload.members;

    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId);

    if (deleteError) {
      console.error('Error deleting old members:', deleteError);
      return new Response(
        JSON.stringify({ success: false, error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (members.length > 0) {
      const membersToInsert = members.map((m) => ({
        team_id: teamId,
        email: m.email,
        name: m.name || null,
        role: (m.role || 'member').toLowerCase(),
        joined_at: m.joined_at || null,
      }));

      const { error: insertMembersError } = await supabase
        .from('team_members')
        .insert(membersToInsert);

      if (insertMembersError) {
        console.error('Error inserting members:', insertMembersError);
        return new Response(
          JSON.stringify({ success: false, error: insertMembersError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3) Insert sync history (best-effort)
    const { error: historyError } = await supabase
      .from('sync_history')
      .insert({
        team_id: teamId,
        member_count: members.length,
        synced_at: now,
      });

    if (historyError) {
      console.error('Error inserting sync history:', historyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        teamId,
        memberCount: members.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('=== sync-team error ===');
    console.error(error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
