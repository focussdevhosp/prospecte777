import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Clock, Users, MessageSquare, Calendar, Target } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ActivityLog } from '@/types/database';

const activityIcons: Record<string, React.ReactNode> = {
  lead_created: <Users className="h-3.5 w-3.5" />,
  message_sent: <MessageSquare className="h-3.5 w-3.5" />,
  meeting_scheduled: <Calendar className="h-3.5 w-3.5" />,
  lead_qualified: <Target className="h-3.5 w-3.5" />,
};

const activityColors: Record<string, { text: string; bg: string }> = {
  lead_created: { text: 'text-info', bg: 'bg-info/10' },
  message_sent: { text: 'text-primary', bg: 'bg-primary/10' },
  meeting_scheduled: { text: 'text-success', bg: 'bg-success/10' },
  lead_qualified: { text: 'text-warning', bg: 'bg-warning/10' },
};

interface RecentActivityProps {
  activities: ActivityLog[];
  isLoading: boolean;
}

export function RecentActivity({ activities, isLoading }: RecentActivityProps) {
  return (
    <Card className="border-border/30 hover:border-border/50 transition-colors duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-success/[0.01] to-transparent pointer-events-none" />
      
      <CardHeader className="pb-1 relative">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-bold">Atividades Recentes</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-2 relative">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-3/4 mb-1.5" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <div className="inline-flex p-4 rounded-2xl bg-muted/30 mb-4">
              <Clock className="h-8 w-8 opacity-30" />
            </div>
            <p className="text-xs font-semibold">Sem atividades ainda</p>
            <p className="text-[10px] mt-1.5 text-muted-foreground">Comece a prospectar para ver atividades</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activities.slice(0, 8).map((activity) => {
              const colors = activityColors[activity.activity_type] || { text: 'text-muted-foreground', bg: 'bg-muted/30' };
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-accent/30 transition-colors duration-200 group"
                >
                  <div className={cn(
                    "shrink-0 p-2 rounded-xl transition-all duration-200 group-hover:scale-110",
                    colors.bg, colors.text
                  )}>
                    {activityIcons[activity.activity_type] || <Clock className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate group-hover:text-foreground transition-colors">{activity.description}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0 font-medium">
                    {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
