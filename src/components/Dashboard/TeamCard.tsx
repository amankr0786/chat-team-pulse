import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Clock, Trash2, ChevronRight } from 'lucide-react';
import { Team } from '@/hooks/useTeams';
import { formatDistanceToNow } from 'date-fns';

interface TeamCardProps {
  team: Team;
  onSelect: (team: Team) => void;
  onDelete: (teamId: string) => void;
}

export function TeamCard({ team, onSelect, onDelete }: TeamCardProps) {
  const lastSynced = team.last_synced_at 
    ? formatDistanceToNow(new Date(team.last_synced_at), { addSuffix: true })
    : 'Never synced';

  return (
    <Card 
      className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/50 animate-fade-in"
      onClick={() => onSelect(team)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold truncate flex-1">
          {team.name}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(team.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold">{team.member_count}</span>
            <span className="text-muted-foreground text-sm">members</span>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="text-xs">{lastSynced}</span>
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
