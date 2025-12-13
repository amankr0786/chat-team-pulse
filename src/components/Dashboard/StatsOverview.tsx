import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, TrendingUp, Clock, Activity } from 'lucide-react';
import { Team, useSyncHistory } from '@/hooks/useTeams';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface StatsOverviewProps {
  teams: Team[];
}

export function StatsOverview({ teams }: StatsOverviewProps) {
  const totalMembers = teams.reduce((sum, team) => sum + team.member_count, 0);
  const totalTeams = teams.length;
  const avgMembers = totalTeams > 0 ? Math.round(totalMembers / totalTeams) : 0;
  
  // Fetch recent sync history across all teams
  const { data: recentSyncs } = useQuery({
    queryKey: ['recent-syncs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_history')
        .select('*, teams(name)')
        .order('synced_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000
  });
  
  const recentlySynced = teams.filter(t => {
    if (!t.last_synced_at) return false;
    const syncedAt = new Date(t.last_synced_at);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return syncedAt > dayAgo;
  }).length;

  const stats = [
    {
      label: 'Total Members',
      value: totalMembers,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Total Teams',
      value: totalTeams,
      icon: Building2,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      label: 'Avg Members/Team',
      value: avgMembers,
      icon: TrendingUp,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: 'Synced Today',
      value: recentlySynced,
      icon: Clock,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={stat.label} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Syncs Debug Panel */}
      {recentSyncs && recentSyncs.length > 0 && (
        <Card className="animate-fade-in">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Recent Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentSyncs.map((sync: any) => (
                <div key={sync.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{sync.teams?.name || 'Unknown Team'}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{sync.member_count} members</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(sync.synced_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
