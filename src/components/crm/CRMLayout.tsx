import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useLeads } from '@/hooks/use-leads';
import {
  Kanban, Users, CheckSquare, BarChart3, Megaphone, MessageSquareText,
  ArrowLeft, Menu, TrendingUp, DollarSign, Zap,
} from 'lucide-react';

const crmNav = [
  { to: '/crm/pipeline', icon: Kanban, label: 'Pipeline', desc: 'Quadro Kanban' },
  { to: '/crm/inbox', icon: MessageSquareText, label: 'Inbox', desc: 'Conversas WhatsApp' },
  { to: '/crm/contacts', icon: Users, label: 'Contatos', desc: 'Todos os leads' },
  { to: '/crm/activities', icon: CheckSquare, label: 'Atividades', desc: 'Reuniões & tarefas' },
  { to: '/crm/automations', icon: Zap, label: 'Automações', desc: 'Regras automáticas' },
  { to: '/crm/analytics', icon: BarChart3, label: 'Analytics', desc: 'Métricas & insights' },
  { to: '/crm/meta-ads', icon: Megaphone, label: 'Meta Ads', desc: 'Facebook & Instagram' },
];

function SidebarContent({ navigate, initials, email, stats }: {
  navigate: (path: string) => void;
  initials: string;
  email: string;
  stats: { pipeline: number; leads: number; wonRate: number };
}) {
  return (
    <>
      {/* Header */}
      <div className="p-5 border-b border-border/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Kanban className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-bold text-sm">CRM</h2>
            <p className="text-[10px] text-muted-foreground">Gestão de Vendas</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground rounded-xl h-9"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao app
        </Button>
      </div>

      {/* Quick stats */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <DollarSign className="h-3.5 w-3.5 mx-auto text-success mb-1" />
            <p className="text-xs font-bold">{new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short', style: 'currency', currency: 'BRL' }).format(stats.pipeline)}</p>
            <p className="text-[9px] text-muted-foreground">Pipeline</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-2.5 text-center">
            <TrendingUp className="h-3.5 w-3.5 mx-auto text-primary mb-1" />
            <p className="text-xs font-bold">{stats.wonRate.toFixed(0)}%</p>
            <p className="text-[9px] text-muted-foreground">Conversão</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {crmNav.map(({ to, icon: Icon, label, desc }) => (
          <NavLink key={to} to={to}>
            {({ isActive }) => (
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'gradient-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}>
                <div className={cn(
                  'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                  isActive ? 'bg-white/20' : 'bg-muted/50'
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{label}</span>
                  <span className={cn(
                    "block text-[10px] truncate",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground/60"
                  )}>{desc}</span>
                </div>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-border/30">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Avatar className="h-8 w-8 ring-2 ring-primary/10">
            <AvatarFallback className="gradient-primary text-primary-foreground text-[10px] font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{email}</p>
            <p className="text-[10px] text-muted-foreground">Gerente</p>
          </div>
        </div>
      </div>
    </>
  );
}

function CRMBreadcrumb() {
  const location = useLocation();
  const current = crmNav.find(n => location.pathname.startsWith(n.to));
  const isDetail = location.pathname.match(/\/crm\/contacts\/.+/);

  return (
    <div className="hidden md:flex items-center gap-1.5 px-6 py-2.5 border-b border-border/30 text-xs text-muted-foreground">
      <NavLink to="/dashboard" className="hover:text-foreground transition-colors">App</NavLink>
      <ChevronRight className="h-3 w-3" />
      <NavLink to="/crm/pipeline" className="hover:text-foreground transition-colors">CRM</NavLink>
      {current && (
        <>
          <ChevronRight className="h-3 w-3" />
          <span className={cn("font-medium", !isDetail && "text-foreground")}>{current.label}</span>
        </>
      )}
      {isDetail && (
        <>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">Detalhes</span>
        </>
      )}
    </div>
  );
}

export default function CRMLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { leads } = useLeads();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = user?.user_metadata?.full_name
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    || user?.email?.[0].toUpperCase() || '?';
  const email = user?.user_metadata?.full_name || user?.email || '';

  const pipeline = leads.filter(l => !['Ganho', 'Perdido'].includes(l.stage)).reduce((s, l) => s + (l.deal_value || 0), 0);
  const totalLeads = leads.filter(l => l.stage !== 'Perdido').length;
  const wonTotal = leads.filter(l => l.stage === 'Ganho').length;
  const wonRate = totalLeads > 0 ? (wonTotal / totalLeads) * 100 : 0;

  const stats = { pipeline, leads: leads.length, wonRate };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] flex-shrink-0 border-r border-border/50 flex-col bg-sidebar">
        <SidebarContent navigate={navigate} initials={initials} email={email} stats={stats} />
      </aside>

      {/* Mobile header + sheet */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 border-b border-border/50 bg-background/95 backdrop-blur-xl flex items-center px-4 gap-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] p-0 flex flex-col">
            <SidebarContent navigate={(path) => { navigate(path); setMobileOpen(false); }} initials={initials} email={email} stats={stats} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
            <Kanban className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-sm">CRM</span>
            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 h-4">{leads.length} leads</Badge>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        {/* Breadcrumb */}
        <CRMBreadcrumb />
        <Outlet />
      </main>
    </div>
  );
}
