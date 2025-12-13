import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TeamMember {
  name: string;
  email: string;
  role: string;
  joined_at?: string | null; // ✅ date added stored here
}

interface SyncPayload {
  teamName: string;
  members: TeamMember[];
}

Deno.serve(async (req) => {
  console.log("=== SYNC-TEAM FUNCTION CALLED ===");
  console.log("Request method:", req.method);
  console.log("Request URL:", req.url);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("Supabase URL configured:", !!supabaseUrl);
    console.log("Supabase Key configured:", !!supabaseKey);

    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    console.log("Raw request body:", rawBody);

    const payload: SyncPayload = JSON.parse(rawBody);
    console.log("=== SYNC REQUEST DETAILS ===");
    console.log("Team name:", payload.teamName);
    console.log("Members count:", payload.members.length);
    console.log("Members data:", JSON.stringify(payload.members, null, 2));

    if (!payload.teamName || !payload.members || !Array.isArray(payload.members)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payload. Expected teamName and members array." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if team exists, if not create it
    let { data: team, error: teamError } = await supabase
      .from("teams")
      .select("*")
      .eq("name", payload.teamName)
      .maybeSingle();

    if (teamError) {
      console.error("Error fetching team:", teamError);
      throw teamError;
    }

    if (!team) {
      // Create new team
      const { data: newTeam, error: createError } = await supabase
        .from("teams")
        .insert({ name: payload.teamName, member_count: payload.members.length })
        .select()
        .single();

      if (createError) {
        console.error("Error creating team:", createError);
        throw createError;
      }
      team = newTeam;
      console.log("Created new team:", team.id);
    }

    // Delete existing members and insert new ones (full sync)
    const { error: deleteError } = await supabase.from("team_members").delete().eq("team_id", team.id);

    if (deleteError) {
      console.error("Error deleting old members:", deleteError);
      throw deleteError;
    }

    // Insert new members
    if (payload.members.length > 0) {
      const membersToInsert = payload.members.map((m) => ({
        team_id: team.id,
        email: m.email,
        name: m.name || null,
        role: (m.role || "member").toLowerCase(),
        joined_at: m.joined_at || null,
      }));

      const { error: insertError } = await supabase.from("team_members").insert(membersToInsert);

      if (insertError) {
        console.error("Error inserting members:", insertError);
        throw insertError;
      }
    }

    // Update team member count and last synced
    const { error: updateError } = await supabase
      .from("teams")
      .update({
        member_count: payload.members.length,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", team.id);

    if (updateError) {
      console.error("Error updating team:", updateError);
      throw updateError;
    }

    // Add to sync history
    const { error: historyError } = await supabase.from("sync_history").insert({
      team_id: team.id,
      member_count: payload.members.length,
    });

    if (historyError) {
      console.error("Error adding sync history:", historyError);
      // Non-critical, don't throw
    }

    console.log("=== SYNC COMPLETED SUCCESSFULLY ===");
    console.log("Team ID:", team.id);
    console.log("Team name:", team.name);
    console.log("Members synced:", payload.members.length);

    return new Response(
      JSON.stringify({
        success: true,
        teamId: team.id,
        teamName: team.name,
        memberCount: payload.members.length,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("=== SYNC ERROR ===");
    console.error("Error type:", error?.constructor?.name);
    console.error("Error message:", error instanceof Error ? error.message : "Unknown error");
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
