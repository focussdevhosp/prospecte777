import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';
import {
  Target,
  LayoutDashboard,
  Kanban,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Moon,
  Sun,
  Menu,
  Zap,
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
  Search,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { BackgroundJobsMonitor } from '@/components/jobs/BackgroundJobsMonitor';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

const mainItems = [
  { title: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
];

const prospectItems = [
  { title: 'Buscar Leads', icon: Search, path: '/prospecting' },
  { title: 'Campanhas', icon: Rocket, path: '/campaigns' },
  { title: 'Radar CNPJ', icon: Building2, path: '/cnpj-radar' },
  { title: 'Agendamentos', icon: Calendar, path: '/scheduled-prospecting' },
];

const engageItems = [
  { title: 'Disparo em Massa', icon: Send, path: '/mass-send' },
  { title: 'Follow-up', icon: RefreshCw, path: '/follow-up' },
  { title: 'Templates', icon: MessageSquareText, path: '/templates' },
  { title: 'Anti-Ban', icon: Shield, path: '/antiban' },
];

const crmItems = [
  { title: 'CRM', icon: Kanban, path: '/crm/pipeline' },
];

const insightItems = [
  { title: 'Analytics', icon: BarChart3, path: '/analytics' },
  { title: 'Testes A/B', icon: FlaskConical, path: '/ab-testing' },
];

const toolItems = [
  { title: 'Agente SDR', icon: Bot, path: '/sdr-agent' },
  { title: 'Localizador de E-mails', icon: Mail, path: '/email-finder' },
  { title: 'Extrator Social', icon: Globe, path: '/social-extractor' },
  { title: 'Reuniões', icon: Calendar, path: '/meetings' },
];

interface TopNavigationProps {
  children: React.ReactNode;
}

export function TopNavigation({ children }: TopNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const userInitials = user?.user_metadata?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || user?.email?.[0].toUpperCase() || '?';

  const isActive = (path: string) => {
    if (path === '/crm/pipeline') return location.pathname.startsWith('/crm');
    return location.pathname === path;
  };

  const NavLinkItem = ({ item, mobile = false }: { item: typeof mainItems[0]; mobile?: boolean }) => {
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        onClick={() => mobile && setMobileMenuOpen(false)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
          active
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
          mobile && "w-full"
        )}
      >
        <item.icon className="h-4 w-4" />
        {item.title}
      </Link>
    );
  };

  const DropdownSection = ({ label, icon: Icon, items }: { label: string; icon: React.ElementType; items: typeof mainItems }) => {
    const hasActive = items.some(item => isActive(item.path));
    return (
      <NavigationMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "flex items-center gap-2 h-9 rounded-xl px-3 transition-all duration-200",
                hasActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[13px] font-medium">{label}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 rounded-xl p-1">
            {items.map((item) => {
              const active = isActive(item.path);
              return (
                <DropdownMenuItem
                  key={item.path}
                  asChild
                  className={cn(
                    "rounded-lg",
                    active && "bg-accent text-accent-foreground font-semibold"
                  )}
                >
                  <Link to={item.path} className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </NavigationMenuItem>
    );
  };

  const mobileSections = [
    { label: null, items: mainItems },
    { label: 'Prospecção', items: prospectItems },
    { label: 'Engajamento', items: engageItems },
    { label: 'CRM', items: crmItems },
    { label: 'Inteligência', items: insightItems },
    { label: 'Ferramentas', items: toolItems },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 safe-top">
        <div className="container flex h-14 items-center px-4 gap-4">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 mr-2 group shrink-0">
            <img src="/logo.png" alt="NexaProspect" className="h-7 w-7 rounded-lg object-contain transition-transform duration-300 group-hover:scale-110" width={28} height={28} />
            <div className="hidden sm:flex items-center gap-1">
              <span className="text-sm font-bold text-gradient">NexaProspect</span>
              <Sparkles className="h-2.5 w-2.5 text-primary/40" />
            </div>
          </Link>

          {/* Desktop nav */}
          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList className="gap-0.5">
              {mainItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <NavigationMenuItem key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2 h-9 px-3 rounded-xl text-[13px] font-medium transition-all duration-200",
                        active
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.title}
                    </Link>
                  </NavigationMenuItem>
                );
              })}

              <DropdownSection label="Prospecção" icon={Target} items={prospectItems} />
              <DropdownSection label="Engajamento" icon={Send} items={engageItems} />

              <NavigationMenuItem>
                <Link
                  to="/crm/pipeline"
                  className={cn(
                    "flex items-center gap-2 h-9 px-3 rounded-xl text-[13px] font-medium transition-all duration-200",
                    isActive('/crm/pipeline')
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Kanban className="h-4 w-4" />
                  CRM
                </Link>
              </NavigationMenuItem>

              <DropdownSection label="Inteligência" icon={BarChart3} items={insightItems} />
              <DropdownSection label="Ferramentas" icon={Zap} items={toolItems} />
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {/* Search trigger */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:flex items-center gap-2 h-8 rounded-xl text-muted-foreground hover:text-foreground px-2.5"
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
                document.dispatchEvent(event);
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-[11px]">Buscar</span>
              <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
                ⌘K
              </kbd>
            </Button>

            <BackgroundJobsMonitor />
            <NotificationCenter />

            <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              asChild
              className={cn(
                "h-8 w-8 rounded-xl hidden sm:flex",
                isActive('/settings')
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Link to="/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>

            {/* User avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/15 hover:ring-primary/30 transition-shadow">
                    <AvatarImage src={user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user?.user_metadata?.full_name || 'Usuário'}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-lg">
                  <Link to="/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive rounded-lg">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8 rounded-xl">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 overflow-y-auto">
                <div className="p-4 border-b border-border/40">
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="NexaProspect" className="h-7 w-7 rounded-lg object-contain" width={28} height={28} />
                    <span className="text-sm font-bold text-gradient">NexaProspect</span>
                  </div>
                </div>
                <nav className="flex flex-col gap-1 p-3">
                  {mobileSections.map((section, i) => (
                    <div key={i} className={cn(i > 0 && "border-t border-border/30 pt-2 mt-1")}>
                      {section.label && (
                        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
                          <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.14em]">
                            {section.label}
                          </p>
                          <div className="flex-1 h-px bg-border/20" />
                        </div>
                      )}
                      <div className="space-y-0.5">
                        {section.items.map((item) => (
                          <NavLinkItem key={item.path} item={item} mobile />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-border/30 pt-2 mt-1">
                    <NavLinkItem item={{ title: 'Configurações', icon: Settings, path: '/settings' }} mobile />
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
