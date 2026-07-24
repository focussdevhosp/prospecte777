import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Target, Send, Users, Bot, ArrowRight, Wifi, WifiOff, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WelcomeCardProps {
  userName?: string | null;
  totalLeads: number;
  whatsappConnected: boolean;
}

const quickActions = [
  { label: 'Prospectar', icon: Target, path: '/prospecting', color: 'text-primary', bg: 'bg-primary/10', hoverBg: 'group-hover:bg-primary/15', glow: 'group-hover:shadow-primary/10' },
  { label: 'Disparar', icon: Send, path: '/mass-send', color: 'text-info', bg: 'bg-info/10', hoverBg: 'group-hover:bg-info/15', glow: 'group-hover:shadow-info/10' },
  { label: 'Ver Leads', icon: Users, path: '/crm/contacts', color: 'text-success', bg: 'bg-success/10', hoverBg: 'group-hover:bg-success/15', glow: 'group-hover:shadow-success/10' },
  { label: 'Agente IA', icon: Bot, path: '/sdr-agent', color: 'text-warning', bg: 'bg-warning/10', hoverBg: 'group-hover:bg-warning/15', glow: 'group-hover:shadow-warning/10' },
];

export function WelcomeCard({ userName, totalLeads, whatsappConnected }: WelcomeCardProps) {
  const greeting = getGreeting();
  const displayName = userName?.split(' ')[0] || 'Usuário';

  return (
    <div className="mb-8">
      {/* Welcome header with subtle gradient background */}
      <div className="relative rounded-2xl p-6 mb-6 overflow-hidden">
        {/* Ambient gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-chart-4/[0.03] pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-radial from-primary/[0.06] to-transparent rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none blur-2xl" />
        
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.15em]">{greeting}</p>
              <Sparkles className="h-3 w-3 text-primary/40" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Olá, <span className="text-gradient">{displayName}</span> 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {totalLeads === 0
                ? 'Comece capturando seus primeiros leads hoje.'
                : `${totalLeads.toLocaleString('pt-BR')} leads na sua base • Vamos crescer!`}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-300",
              whatsappConnected
                ? "bg-success/8 text-success border-success/15 shadow-sm shadow-success/5"
                : "bg-muted/50 text-muted-foreground border-border/50"
            )}>
              {whatsappConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
            </div>
            {!whatsappConnected && (
              <Button asChild size="sm" className="gradient-primary h-9 text-xs shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-shadow">
                <Link to="/settings/connections" className="gap-1.5">
                  Conectar <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((action) => (
          <div key={action.path}>
            <Link
              to={action.path}
              className={cn(
                "group relative flex items-center gap-3 p-4 rounded-2xl border border-border/30",
                "hover:border-border/60 transition-all duration-300",
                "active:scale-[0.97] hover:shadow-lg",
                action.glow
              )}
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent to-transparent group-hover:from-primary/[0.02] group-hover:to-chart-4/[0.02] transition-all duration-500 pointer-events-none" />
              
              <div className={cn(
                "relative p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                action.bg, action.hoverBg, action.color
              )}>
                <action.icon className="h-4.5 w-4.5" />
              </div>
              <div className="relative">
                <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{action.label}</span>
                <ArrowRight className="absolute -right-5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 group-hover:-right-6 transition-all duration-300" />
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
