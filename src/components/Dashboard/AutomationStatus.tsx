import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSchedulerStatus } from '@/hooks/useSchedulerStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, PlayCircle, CheckCircle2, XCircle, Timer, Server, Zap } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';

export function AutomationStatus() {
  const { data: scheduler, isLoading, refetch } = useSchedulerStatus();
  const [isTriggering, setIsTriggering] = useState(false);

  const handleRunSyncNow = async () => {
    setIsTriggering(true);
    try {
      const { error } = await supabase.functions.invoke('update-scheduler-status', {
        body: {
          status: 'pending',
          trigger_manual: true,
          next_run_at: new Date().toISOString(),
        },
      });
      
      if (error) throw error;
      
      toast.success('Sync triggered! The Windows Task Scheduler will pick this up on its next poll.');
      refetch();
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      toast.error('Failed to trigger sync');
    } finally {
      setIsTriggering(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Automation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!scheduler) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Running...</Badge>;
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed ✓</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed ✗</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground">Idle</Badge>;
    }
  };

  const getHealthColor = () => {
    if (!scheduler.last_run_at) return 'text-muted-foreground';
    const lastRun = new Date(scheduler.last_run_at);
    const hoursSinceRun = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceRun < 24) return 'text-green-400';
    if (hoursSinceRun < 48) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatNextRun = () => {
    if (!scheduler.next_run_at) return 'Not scheduled';
    const nextRun = new Date(scheduler.next_run_at);
    const now = new Date();
    
    if (nextRun <= now) return 'Pending...';
    return `in ${formatDistanceToNow(nextRun)}`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Automation Status
          </CardTitle>
          <Button 
            size="sm" 
            className="gap-1.5"
            onClick={handleRunSyncNow}
            disabled={isTriggering || scheduler.status === 'running'}
          >
            <Zap className="h-4 w-4" />
            Run Sync Now
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Last Run */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Last Run
            </div>
            <div className={`font-medium ${getHealthColor()}`}>
              {scheduler.last_run_at 
                ? formatDistanceToNow(new Date(scheduler.last_run_at), { addSuffix: true })
                : 'Never'}
            </div>
            {scheduler.last_run_at && (
              <div className="text-xs text-muted-foreground">
                {format(new Date(scheduler.last_run_at), 'MMM d, HH:mm')}
              </div>
            )}
          </div>

          {/* Next Run */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlayCircle className="h-3.5 w-3.5" />
              Next Run
            </div>
            <div className="font-medium">
              {formatNextRun()}
            </div>
            {scheduler.next_run_at && new Date(scheduler.next_run_at) > new Date() && (
              <div className="text-xs text-muted-foreground">
                {format(new Date(scheduler.next_run_at), 'MMM d, HH:mm')}
              </div>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Status
            </div>
            <div className="font-medium">
              {getStatusBadge(scheduler.status)}
            </div>
          </div>

          {/* Profiles Synced */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
              Profiles Synced
            </div>
            <div className="font-medium">
              {scheduler.profiles_synced}/{scheduler.total_profiles}
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div 
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${(scheduler.profiles_synced / scheduler.total_profiles) * 100}%` }}
              />
            </div>
          </div>

          {/* Run Duration */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              Duration
            </div>
            <div className="font-medium">
              {formatDuration(scheduler.run_duration_seconds)}
            </div>
          </div>

          {/* Health Indicator */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <XCircle className="h-3.5 w-3.5" />
              Sync Health
            </div>
            <div className={`font-medium ${getHealthColor()}`}>
              {!scheduler.last_run_at 
                ? 'No data'
                : (() => {
                    const hours = (Date.now() - new Date(scheduler.last_run_at).getTime()) / (1000 * 60 * 60);
                    if (hours < 24) return 'Healthy';
                    if (hours < 48) return 'Stale';
                    return 'Outdated';
                  })()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}