import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Team {
  id: string;
  name: string;
  chatgpt_team_id: string | null;
  member_count: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  email: string;
  name: string | null;
  role: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncHistory {
  id: string;
  team_id: string;
  member_count: number;
  synced_at: string;
}

export function useTeams() {
  const queryClient = useQueryClient();

  // Set up real-time subscription for teams table
  useEffect(() => {
    console.log("[Realtime] Setting up teams subscription...");

    const channel = supabase
      .channel("teams-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teams",
        },
        (payload) => {
          console.log("[Realtime] Teams change detected:", payload);
          queryClient.invalidateQueries({ queryKey: ["teams"] });
        },
      )
      .subscribe((status) => {
        console.log("[Realtime] Teams subscription status:", status);
      });

    return () => {
      console.log("[Realtime] Cleaning up teams subscription");
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").order("updated_at", { ascending: false });

      if (error) throw error;

      const byName = new Map<string, Team>();
      for (const t of data as Team[]) {
        const key = (t.name || "").trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, t); // keep newest (because we ordered updated_at desc)
      }

      return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useTeamMembers(teamId: string | null) {
  return useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase.from("team_members").select("*").eq("team_id", teamId).order("name");

      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!teamId,
  });
}

export function useSyncHistory(teamId: string | null) {
  return useQuery({
    queryKey: ["sync-history", teamId],
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase
        .from("sync_history")
        .select("*")
        .eq("team_id", teamId)
        .order("synced_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as SyncHistory[];
    },
    enabled: !!teamId,
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", teamId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useAddTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("teams").insert({ name }).select().single();

      if (error) throw error;
      return data as Team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}
