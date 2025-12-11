import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Users, Mail, Calendar } from 'lucide-react';
import { Team, useTeamMembers, useSyncHistory } from '@/hooks/useTeams';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

function capitalizeRole(role: string | null): string {
  if (!role) return 'Member';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

interface TeamDetailsProps {
  team: Team | null;
  open: boolean;
  onClose: () => void;
}

export function TeamDetails({ team, open, onClose }: TeamDetailsProps) {
  const { data: members, isLoading: membersLoading } = useTeamMembers(team?.id ?? null);
  const { data: history } = useSyncHistory(team?.id ?? null);

  const chartData = history?.slice().reverse().map(h => ({
    date: format(new Date(h.synced_at), 'MMM d'),
    members: h.member_count,
  })) ?? [];

  const exportToCSV = () => {
    if (!members || !team) return;
    
    const headers = ['Name', 'Email', 'Role', 'Date Added'];
    const rows = members.map(m => [
      m.name || '',
      m.email,
      capitalizeRole(m.role),
      m.created_at ? format(new Date(m.created_at), 'yyyy-MM-dd') : '',
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${team.name}-members.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {team?.name}
          </SheetTitle>
          <SheetDescription>
            {team?.member_count} members • Last synced {team?.last_synced_at 
              ? format(new Date(team.last_synced_at), 'PPp')
              : 'never'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* History Chart */}
          {chartData.length > 1 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Member Count History</h3>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }} 
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      stroke="hsl(var(--muted-foreground))"
                      width={30}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="members" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Members Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Team Members</h3>
              <Button variant="outline" size="sm" onClick={exportToCSV} disabled={!members?.length}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            
            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Date Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membersLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : members?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No members synced yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    members?.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name || '—'}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>
                          <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                            {capitalizeRole(member.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.created_at ? format(new Date(member.created_at), 'MMM d, yyyy') : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
