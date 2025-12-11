import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, TrendingUp, Clock } from 'lucide-react';
import { Team } from '@/hooks/useTeams';

interface StatsOverviewProps {
  teams: Team[];
}

export function StatsOverview({ teams }: StatsOverviewProps) {
  const totalMembers = teams.reduce((sum, team) => sum + team.member_count, 0);
  const totalTeams = teams.length;
  const avgMembers = totalTeams > 0 ? Math.round(totalMembers / totalTeams) : 0;
  
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
  );
}
