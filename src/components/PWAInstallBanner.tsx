import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallBanner() {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Don't show in iframes or preview hosts
    const isInIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const isPreviewHost = window.location.hostname.includes('id-preview--') || window.location.hostname.includes('lovableproject.com');
    
    if (isInIframe || isPreviewHost || !user) return;

    // Check if already dismissed
    if (localStorage.getItem('pwa_banner_dismissed') === 'true') return;

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
    // `user` precisa estar aqui. O efeito DECIDE por ele (`if (... || !user) return`)
    // e a autenticação resolve depois da montagem — com a lista vazia, ele
    // rodava uma vez com `user` nulo, saía cedo e nunca mais rodava. O banner
    // de instalação não aparecia para ninguém.
  }, [user]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('pwa_banner_dismissed', 'true');
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa_banner_dismissed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-fade-in">
      <div className="flex items-center gap-3 p-4 rounded-xl bg-card border shadow-lg">
        <div className="p-2 rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Instale o NexaProspect</p>
          <p className="text-xs text-muted-foreground">Acesse com 1 toque no celular</p>
        </div>
        <Button size="sm" onClick={handleInstall}>
          Instalar
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
