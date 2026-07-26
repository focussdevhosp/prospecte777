import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoImg from '@/assets/logo.webp';
import { useAuth } from '@/lib/auth';
import { useAdminRole } from '@/hooks/use-admin';
import { useTheme } from 'next-themes';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Target,
  LayoutDashboard,
  Kanban,
  BarChart3,
  Settings,
  LogOut,
  ChevronUp,
  BookOpen,
  Sparkles,
  Rocket,
  RefreshCw,
  MessageSquareText,
  Shield,
  Send,
  Mail,
  Calendar,
  FlaskConical,
  Building2,
  Globe,
  Bot,
  CreditCard,
  Code2,
  ShieldCheck,
  Search,
  Crown,
  Moon,
  Sun,
  Headphones,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Icon color map per section
const sectionIconColors: Record<string, string> = {
  main: 'text-chart-1',
  prospect: 'text-chart-2',
  communicate: 'text-chart-3',
  sell: 'text-chart-4',
  analyze: 'text-chart-5',
};

// ─── INÍCIO ─────────────────────────────────────────────
const mainItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', section: 'main' },
];

// ─── 1. PROSPECTAR (agrupa 4 ferramentas de busca) ──────
const prospectItems = [
  { title: 'Prospectar', icon: Search, path: '/prospecting', badge: 'IA', section: 'prospect',
    matchPaths: ['/prospecting', '/cnpj-radar', '/email-finder', '/social-extractor'] },
];

// ─── 2. COMUNICAR (agrupa mensagens + biblioteca) ───────
const communicateItems = [
  { title: 'Disparos', icon: Send, path: '/mass-send', section: 'communicate',
    matchPaths: ['/mass-send', '/follow-up', '/cold-reactivation'] },
  { title: 'Biblioteca', icon: MessageSquareText, path: '/templates', section: 'communicate',
    matchPaths: ['/templates', '/objections', '/antiban'] },
];

// ─── 3. VENDER (CRM + campanhas) ────────────────────────
const sellItems = [
  { title: 'CRM Pipeline', icon: Kanban, path: '/crm/pipeline', badge: 'PRO', section: 'sell',
    matchPaths: ['/crm'] },
  { title: 'Campanhas', icon: Rocket, path: '/campaigns', section: 'sell',
    matchPaths: ['/campaigns', '/ab-testing', '/sdr-agent', '/meetings'] },
];

// ─── 4. ANALISAR ────────────────────────────────────────
const analyzeItems = [
  { title: 'Analytics', icon: BarChart3, path: '/analytics', section: 'analyze' },
];

type NavItem = { title: string; icon: React.ComponentType<{ className?: string }>; path: string; badge?: string; section?: string; matchPaths?: string[] };

const sections: { label: string | null; items: NavItem[]; sectionKey: string }[] = [
  { label: null, items: mainItems, sectionKey: 'main' },
  { label: 'Prospectar', items: prospectItems, sectionKey: 'prospect' },
  { label: 'Comunicar', items: communicateItems, sectionKey: 'communicate' },
  { label: 'Vender', items: sellItems, sectionKey: 'sell' },
  { label: 'Analisar', items: analyzeItems, sectionKey: 'analyze' },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useAdminRole();
  const { state } = useSidebar();
  const { theme, setTheme } = useTheme();
  const collapsed = state === 'collapsed';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = user?.user_metadata?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || user?.email?.[0].toUpperCase() || '?';

  const isActive = (path: string, matchPaths?: string[]) => {
    if (matchPaths && matchPaths.length) {
      return matchPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
    }
    if (path === '/crm/pipeline') return location.pathname.startsWith('/crm');
    return location.pathname === path;
  };

  const MenuItem = ({ item }: { item: NavItem }) => {
    const active = isActive(item.path, item.matchPaths);
    const content = (
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "relative h-9 rounded-xl transition-all duration-200 group/item overflow-hidden",
          active
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            : "hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
        )}
      >
        <Link to={item.path} className="flex items-center gap-3 px-3">
          <div className={cn(
            "relative flex items-center justify-center shrink-0",
            active && "drop-shadow-sm"
          )}>
            <item.icon className={cn(
              "h-[17px] w-[17px] transition-all duration-200",
              active
                ? 'text-primary-foreground'
                : item.section
                  ? sectionIconColors[item.section]
                  : 'text-muted-foreground group-hover/item:text-foreground'
            )} />
          </div>
          {!collapsed && (
            <>
              <span className={cn(
                "text-[13px] font-medium truncate flex-1",
                active ? "text-primary-foreground font-semibold" : ""
              )}>
                {item.title}
              </span>
              {item.badge && !active && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-[18px] px-1.5 text-[9px] font-bold rounded-md border-0 shrink-0",
                    item.badge === 'IA'
                      ? "bg-chart-4/15 text-chart-4"
                      : item.badge === 'PRO'
                        ? "bg-chart-3/15 text-chart-3"
                        : "bg-primary/10 text-primary"
                  )}
                >
                  {item.badge}
                </Badge>
              )}
            </>
          )}
          {/* Active indicator line */}
          {active && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary-foreground/50" />
          )}
        </Link>
      </SidebarMenuButton>
    );

    if (collapsed) {
      return (
        <SidebarMenuItem>
          <Tooltip>
            <TooltipTrigger asChild>
              {content}
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {item.title}
            </TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      );
    }

    return <SidebarMenuItem>{content}</SidebarMenuItem>;
  };

  const SectionLabel = ({ children, sectionKey }: { children: React.ReactNode; sectionKey?: string }) => {
    if (collapsed) return null;
    const dotColor = sectionKey ? sectionIconColors[sectionKey] : 'text-muted-foreground/40';
    return (
      <div className="px-4 pt-5 pb-1.5 flex items-center gap-2">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor, "bg-current")} />
        <p className="text-[10px] font-bold text-sidebar-foreground/50 uppercase tracking-[0.16em]">
          {children}
        </p>
        <div className="flex-1 h-px bg-border/30" />
      </div>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60 bg-sidebar dark:glass">
      <SidebarHeader className="p-4 pb-5">
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="relative">
            <img
              src={logoImg}
              alt="NexaProspect"
              className="h-8 w-8 rounded-xl object-contain transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
              width={32}
              height={32}
            />
            <div className="absolute -inset-0.5 rounded-xl bg-primary/20 blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold tracking-tight text-gradient">NexaProspect</span>
              <Sparkles className="h-3 w-3 text-primary/50" />
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 overflow-y-auto scrollbar-thin">
        {sections.map((section, i) => (
          <div key={i}>
            {section.label && <SectionLabel sectionKey={section.sectionKey}>{section.label}</SectionLabel>}
            <SidebarMenu className="space-y-0.5">
              {section.items.map((item) => (
                <MenuItem key={item.path} item={item} />
              ))}
            </SidebarMenu>
          </div>
        ))}

        {isAdmin && (
          <>
            <SectionLabel sectionKey="main">Admin</SectionLabel>
            <SidebarMenu className="space-y-0.5">
              <MenuItem item={{ title: 'Painel Admin', icon: ShieldCheck, path: '/admin', badge: 'ADM' }} />
            </SidebarMenu>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/30 space-y-1">
        {/* Theme toggle */}
        <SidebarMenu className="space-y-0.5">
          <SidebarMenuItem>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="rounded-xl h-9 text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    <div className="flex items-center justify-center px-3">
                      <Sun className="h-[17px] w-[17px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                      <Moon className="absolute h-[17px] w-[17px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </div>
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">Alternar tema</TooltipContent>
              </Tooltip>
            ) : (
              <SidebarMenuButton
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="rounded-xl h-9 text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <div className="flex items-center gap-3 px-3">
                  <Sun className="h-[17px] w-[17px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-[17px] w-[17px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 ml-[0px]" />
                  <span className="text-[13px] font-medium">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
                </div>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu className="space-y-0.5">
          {[
            { title: 'Suporte', icon: Headphones, path: '/support' },
            { title: 'Configurações', icon: Settings, path: '/settings' },
            { title: 'Planos', icon: CreditCard, path: '/billing' },
          ].map((item) => {
            const active = isActive(item.path);
            const btn = (
              <SidebarMenuButton
                asChild
                isActive={active}
                className={cn(
                  "rounded-xl h-9 transition-all duration-200",
                  active
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                <Link to={item.path} className="flex items-center gap-3 px-3">
                  <item.icon className={cn(
                    "h-[17px] w-[17px]",
                    active ? "text-primary-foreground" : item.path === '/settings' ? "text-chart-5" : "text-chart-3"
                  )} />
                  {!collapsed && <span className="text-[13px] font-medium">{item.title}</span>}
                  {item.path === '/billing' && !collapsed && !active && (
                    <Crown className="h-3 w-3 text-chart-3 ml-auto" />
                  )}
                </Link>
              </SidebarMenuButton>
            );

            if (collapsed) {
              return (
                <SidebarMenuItem key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">{item.title}</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              );
            }

            return <SidebarMenuItem key={item.path}>{btn}</SidebarMenuItem>;
          })}
        </SidebarMenu>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 h-auto py-2.5 rounded-xl hover:bg-accent transition-all duration-200",
                collapsed && "justify-center px-0"
              )}
            >
              <Avatar className="h-8 w-8 ring-2 ring-primary/15 transition-shadow hover:ring-primary/30">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[12px] font-semibold truncate">
                      {user?.user_metadata?.full_name || 'Usuário'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <ChevronUp className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
            {collapsed && (
              <>
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user?.user_metadata?.full_name || 'Usuário'}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild className="rounded-lg">
              <Link to="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-chart-5" />
                Configurações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg">
              <Link to="/tutorial" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-chart-2" />
                Tutorial
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-lg">
              <Link to="/api-reference" className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-chart-4" />
                API
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive rounded-lg">
              <LogOut className="h-4 w-4 mr-2 text-destructive" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
