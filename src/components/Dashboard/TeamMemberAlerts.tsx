import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { Team } from '@/hooks/useTeams';
import { useTeamAlerts, useAcknowledgeAlert } from '@/hooks/useTeamAlerts';
import { toast } from 'sonner';

const MEMBER_LIMIT = 6;

interface TeamMemberAlertsProps {
  teams: Team[];
  onSyncTeam: (team: Team) => void;
}

export function TeamMemberAlerts({ teams, onSyncTeam }: TeamMemberAlertsProps) {
  const { data: alerts } = useTeamAlerts();
  const acknowledgeAlert = useAcknowledgeAlert();

  const acknowledgedTeamIds = new Set(
    alerts?.filter(a => a.alert_type === 'member_limit').map(a => a.team_id) ?? []
  );

  const teamsOverLimit = teams.filter(
    team => (team.member_count ?? 0) > MEMBER_LIMIT && !acknowledgedTeamIds.has(team.id)
  );

  if (teamsOverLimit.length === 0) {
    return null;
  }

  const handleAcknowledge = async (teamId: string) => {
    try {
      await acknowledgeAlert.mutateAsync({ teamId, alertType: 'member_limit' });
      toast.success('Alert acknowledged');
    } catch (error) {
      toast.error('Failed to acknowledge alert');
    }
  };

  return (
    <div className="space-y-3">
      {teamsOverLimit.map((team) => (
        <Alert key={team.id} variant="destructive" className="border-orange-500/50 bg-orange-500/10">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-400 font-semibold">
            Member Limit Alert
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-foreground/80">
                <strong>{team.name}</strong> has <strong>{team.member_count}</strong> members 
                (exceeds limit of {MEMBER_LIMIT})
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-orange-500/30 hover:bg-orange-500/10"
                  onClick={() => onSyncTeam(team)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync Now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => handleAcknowledge(team.id)}
                  disabled={acknowledgeAlert.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                  Checked
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
