import { useState, useEffect } from 'react';
import { useTeams, useDeleteTeam, Team } from '@/hooks/useTeams';
import { StatsOverview } from '@/components/Dashboard/StatsOverview';
import { TeamCard } from '@/components/Dashboard/TeamCard';
import { TeamDetails } from '@/components/Dashboard/TeamDetails';
import { BookmarkletGuide } from '@/components/Dashboard/BookmarkletGuide';
import { AddTeamDialog } from '@/components/Dashboard/AddTeamDialog';
import { AutomationStatus } from '@/components/Dashboard/AutomationStatus';
import { TeamMemberAlerts } from '@/components/Dashboard/TeamMemberAlerts';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Building2, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Index() {
  const { data: teams, isLoading, refetch } = useTeams();
  const deleteTeam = useDeleteTeam();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  const filteredTeams = teams?.filter(team =>
    team.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    try {
      await deleteTeam.mutateAsync(teamToDelete);
      toast.success('Team deleted successfully');
    } catch (error) {
      toast.error('Failed to delete team');
    }
    setTeamToDelete(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">ChatGPT Team Dashboard</h1>
                <p className="text-sm text-muted-foreground">Monitor all your teams in one place</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <AddTeamDialog />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Team Member Alerts */}
        <TeamMemberAlerts 
          teams={teams ?? []} 
          onSyncTeam={(team) => {
            toast.info(`Open the browser extension on ${team.name}'s admin page to sync.`);
          }}
        />

        {/* Stats */}
        <StatsOverview teams={teams ?? []} />

        {/* Automation Status */}
        <AutomationStatus />

        {/* Bookmarklet Guide */}
        <BookmarkletGuide />

        {/* Teams Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Teams</h2>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teams..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {search ? 'No teams match your search' : 'No teams yet'}
              </p>
              <p className="text-sm">
                {search ? 'Try a different search term' : 'Add a team manually or use the bookmarklet to sync from ChatGPT'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  onSelect={setSelectedTeam}
                  onDelete={setTeamToDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Team Details Sheet */}
      <TeamDetails
        team={selectedTeam}
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!teamToDelete} onOpenChange={() => setTeamToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the team and all its member data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
