import { ReactNode, createContext, useContext, useState, useEffect, useRef } from 'react';

import { useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { TopNavigation } from '@/components/TopNavigation';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { Moon, Sun, PanelLeft, PanelTop, Search, WifiOff } from 'lucide-react';
import { BackgroundJobsMonitor } from '@/components/jobs/BackgroundJobsMonitor';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { cn } from '@/lib/utils';

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
  /** Onde a tela mora no produto. Aparece acima do título. */
  eyebrow?: string;
  icon?: ReactNode;
}

export function DashboardLayout({
  children,
  title,
  description,
  actions,
  eyebrow,
  icon,
}: DashboardLayoutProps) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const isOnline = useOnlineStatus();

  // Quem rola é o `SidebarInset`, não a janela. A distinção não é detalhe:
  // a versão anterior chamava `window.scrollTo` a cada troca de rota e não
  // acontecia nada — abrir uma tela nova a partir do rodapé de outra
  // deixava o usuário no meio dela, sem cabeçalho e sem contexto.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rolou, setRolou] = useState(false);

  const [navigationMode, setNavigationMode] = useState<NavigationMode>(() => {
    const saved = localStorage.getItem('navigation-mode');
    return (saved as NavigationMode) || 'sidebar';
  });

  useEffect(() => {
    localStorage.setItem('navigation-mode', navigationMode);
  }, [navigationMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setRolou(false);
  }, [location.pathname]);

  // O título só aparece na barra fixa depois que o título grande sai de
  // cena. Mostrar os dois ao mesmo tempo é repetir a mesma frase duas vezes
  // na mesma tela.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        setRolou(el.scrollTop > 56);
        frame = 0;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [navigationMode]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleNavigationMode = () =>
    setNavigationMode(navigationMode === 'sidebar' ? 'topbar' : 'sidebar');

  const offlineBanner = !isOnline && (
    // `text-warning-foreground`, e não `text-warning`: o fundo e o texto
    // eram a MESMA cor, então o aviso de "sem conexão" era uma tarja
    // amarela sem nada escrito dentro.
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-warning py-2 text-center text-xs font-semibold text-warning-foreground">
      <WifiOff className="h-3.5 w-3.5" />
      Sem conexão — algumas funcionalidades podem não estar disponíveis
    </div>
  );

  const acoesDaBarra = (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
            }
            className="hidden h-8 gap-1.5 text-muted-foreground hover:text-foreground sm:flex"
            aria-label="Busca rápida"
          >
            <Search className="h-3.5 w-3.5" />
            <kbd className="rounded border border-border/40 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Busca rápida</TooltipContent>
      </Tooltip>

      <BackgroundJobsMonitor />

      {/* O sino existia, tinha tooltip, e não fazia nada: nenhum onClick,
          nenhum contador. A central de notificações já estava pronta e só
          era usada no modo de menu no topo — quem usava a barra lateral
          nunca via uma notificação. */}
      <NotificationCenter />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleNavigationMode}
            className="hidden h-8 w-8 text-muted-foreground hover:text-foreground sm:flex"
            aria-label="Menu no topo"
          >
            <PanelTop className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Menu no topo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Alternar tema"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Alternar tema</TooltipContent>
      </Tooltip>
    </div>
  );

  if (navigationMode === 'topbar') {
    return (
      <NavigationContext.Provider value={{ mode: navigationMode, setMode: setNavigationMode }}>
        {offlineBanner}
        <TopNavigation>
          <div
            className={cn(
              'mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8',
              !isOnline && 'mt-8',
            )}
          >
            <PageHeader
              title={title}
              description={description}
              eyebrow={eyebrow}
              icon={icon}
              actions={
                <>
                  {actions}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleNavigationMode}
                        className="h-8 w-8 text-muted-foreground"
                        aria-label="Menu lateral"
                      >
                        <PanelLeft className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Menu lateral</TooltipContent>
                  </Tooltip>
                </>
              }
            />
            <div key={location.pathname} className="page-enter">
              {children}
            </div>
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
        <SidebarInset
          ref={scrollRef}
          className={cn('flex min-h-screen flex-col overflow-y-auto', !isOnline && 'mt-8')}
        >
          <header
            className={cn(
              'sticky top-0 z-20 flex h-14 shrink-0 items-center bg-background/80 backdrop-blur-2xl',
              // A borda só aparece quando há conteúdo passando por baixo.
              // Parada no topo ela é uma linha sem função separando nada.
              'border-b transition-colors duration-200',
              rolou ? 'border-border/60' : 'border-transparent',
            )}
          >
            <div className="flex flex-1 items-center gap-3 px-4 sm:px-6">
              <SidebarTrigger className="-ml-1 text-muted-foreground transition-colors duration-200 hover:text-foreground" />

              <div
                className={cn(
                  'min-w-0 transition-all duration-300',
                  rolou ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-4 w-px bg-border/40" />
                  <span className="truncate text-sm font-semibold">{title}</span>
                </div>
              </div>

              <div className="flex-1" />

              {acoesDaBarra}
            </div>
          </header>

          {/* `div`, e não `main`: o `SidebarInset` já é o `<main>` da
              página. Dois aninhados é HTML inválido, e leitor de tela
              perde a referência de onde começa o conteúdo. */}
          <div className="relative z-0 flex-1 bg-background p-4 text-foreground sm:p-6 lg:p-8">
            {/* `key` na rota: sem ela o React reaproveita a árvore entre
                telas e a animação de entrada não roda — a troca de página
                fica sem nenhum sinal de que algo mudou. */}
            <div key={location.pathname} className="page-enter">
              {/* As ações ficam ao lado do título, não na barra fixa. Botão
                  de ação principal escondido entre os ícones globais é
                  botão que ninguém acha. */}
              <PageHeader
                title={title}
                description={description}
                eyebrow={eyebrow}
                icon={icon}
                actions={actions}
              />
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NavigationContext.Provider>
  );
}
