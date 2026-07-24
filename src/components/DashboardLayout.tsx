import { ReactNode, createContext, useContext, useState, useEffect } from 'react';

import { useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { TopNavigation } from '@/components/TopNavigation';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { Moon, Sun, PanelLeft, PanelTop, Bell, Search, WifiOff } from 'lucide-react';
import { BackgroundJobsMonitor } from '@/components/jobs/BackgroundJobsMonitor';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOnlineStatus } from '@/hooks/use-online-status';

type NavigationMode = 'sidebar' | 'topbar';

interface NavigationContextType {
  mode: NavigationMode;
  setMode: (mode: NavigationMode) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  mode: 'sidebar',
  setMode: () => {},
});

export const useNavigationMode = () => useContext(NavigationContext);

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function DashboardLayout({ children, title, description, actions }: DashboardLayoutProps) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem('navigation-mode');
    return (saved as NavigationMode) || 'sidebar';
  });

  useEffect(() => {
    localStorage.setItem('navigation-mode', navigationMode);
  }, [navigationMode]);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleNavigationMode = () => setNavigationMode(navigationMode === 'sidebar' ? 'topbar' : 'sidebar');

  const offlineBanner = !isOnline && (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 text-center text-xs font-semibold py-2 flex items-center justify-center gap-2">
      <WifiOff className="h-3.5 w-3.5" />
      Sem conexão — algumas funcionalidades podem não estar disponíveis
    </div>
  );

  if (navigationMode === 'topbar') {
    return (
      <NavigationContext.Provider value={{ mode: navigationMode, setMode: setNavigationMode }}>
        {offlineBanner}
        <TopNavigation>
          <div className={`max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 ${!isOnline ? 'mt-8' : ''}`}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
                {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
              </div>
              <div className="flex items-center gap-1">
                {actions}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={toggleNavigationMode} className="h-8 w-8 text-muted-foreground" aria-label="Menu lateral">
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Menu lateral</TooltipContent>
                </Tooltip>
              </div>
            </div>
            {children}
          </div>
        </TopNavigation>
      </NavigationContext.Provider>
    );
  }

  return (
    <NavigationContext.Provider value={{ mode: navigationMode, setMode: setNavigationMode }}>
      {offlineBanner}
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className={`flex flex-col min-h-screen overflow-y-auto ${!isOnline ? 'mt-8' : ''}`}>
          {/* Clean minimal header */}
          <header className="sticky top-0 z-20 flex h-13 shrink-0 items-center border-b border-border/50 bg-background/80 backdrop-blur-2xl">
            <div className="flex items-center gap-3 flex-1 px-4 sm:px-6">
              <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors duration-200" />
              <div className="h-4 w-px bg-border/30" />
              <span className="text-sm font-bold truncate">{title}</span>
              <div className="flex-1" />

              {/* Right actions */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
                      className="h-8 gap-1.5 text-muted-foreground hover:text-foreground hidden sm:flex"
                      aria-label="Busca rápida"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <kbd className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded border border-border/30">⌘K</kbd>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Busca rápida</TooltipContent>
                </Tooltip>
                {actions}
                <BackgroundJobsMonitor />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Notificações">
                      <Bell className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Notificações</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={toggleNavigationMode} className="h-8 w-8 hidden sm:flex text-muted-foreground hover:text-foreground" aria-label="Menu no topo">
                      <PanelTop className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Menu no topo</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Alternar tema">
                      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Alternar tema</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-gradient-to-b from-background to-background/95">
            {description && (
              <p className="text-muted-foreground mb-6 text-sm">{description}</p>
            )}
            {children}

          </main>
        </SidebarInset>
      </SidebarProvider>
    </NavigationContext.Provider>
  );
}
