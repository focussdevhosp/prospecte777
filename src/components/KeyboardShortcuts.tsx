import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string[];
  label: string;
  action: () => void;
  category: string;
}

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  // Memorizado porque o efeito abaixo lê esta lista. Recriada a cada render,
  // ou o efeito reassina o listener sem parar, ou fecha sobre a versão da
  // primeira renderização — os dois são jeitos diferentes de o atalho parar
  // de funcionar sem ninguém perceber.
  const shortcuts: Shortcut[] = useMemo(() => [
    // Navigation
    { keys: ['g', 'd'], label: 'Dashboard', action: () => navigate('/dashboard'), category: 'Navegação' },
    { keys: ['g', 'p'], label: 'Prospecção', action: () => navigate('/prospecting'), category: 'Navegação' },
    { keys: ['g', 'c'], label: 'CRM Pipeline', action: () => navigate('/crm/pipeline'), category: 'Navegação' },
    { keys: ['g', 'i'], label: 'Inbox', action: () => navigate('/crm/inbox'), category: 'Navegação' },
    { keys: ['g', 'm'], label: 'Disparo em Massa', action: () => navigate('/mass-send'), category: 'Navegação' },
    { keys: ['g', 'a'], label: 'Analytics', action: () => navigate('/analytics'), category: 'Navegação' },
    { keys: ['g', 's'], label: 'Configurações', action: () => navigate('/settings'), category: 'Navegação' },
    // Global
    { keys: ['?'], label: 'Mostrar atalhos', action: () => setShowHelp(true), category: 'Global' },
  ], [navigate]);

  useEffect(() => {
    let pendingKey: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      // Ignore with modifiers (Ctrl+K handled by CommandPalette)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (key === '?' && !e.shiftKey) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      if (pendingKey) {
        const combo = [pendingKey, key];
        const matched = shortcuts.find(
          (s) => s.keys.length === 2 && s.keys[0] === combo[0] && s.keys[1] === combo[1]
        );
        if (matched) {
          e.preventDefault();
          matched.action();
        }
        pendingKey = null;
        if (timer) clearTimeout(timer);
        return;
      }

      if (key === 'g') {
        pendingKey = 'g';
        timer = setTimeout(() => { pendingKey = null; }, 800);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [navigate, location.pathname, shortcuts]);

  const grouped = shortcuts.reduce<Record<string, Shortcut[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Atalhos de Teclado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</h4>
              <div className="space-y-1.5">
                {items.map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/50">
                    <span className="text-sm">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-muted-foreground mx-0.5 text-xs">+</span>}
                          <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-mono font-medium">
                            {k === '?' ? '?' : k.toUpperCase()}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between py-1.5 px-2">
              <span className="text-sm">Busca rápida</span>
              <div className="flex items-center gap-1">
                <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-mono font-medium">⌘</kbd>
                <span className="text-muted-foreground mx-0.5 text-xs">+</span>
                <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-mono font-medium">K</kbd>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
