import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface GroupNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface Props {
  items: GroupNavItem[];
  className?: string;
}

/** Horizontal tab-style navigation between sibling pages of a section. */
export function GroupNav({ items, className }: Props) {
  const { pathname } = useLocation();
  return (
    <div className={cn('mb-6 -mt-2 flex items-center gap-1 border-b border-border/40 overflow-x-auto scrollbar-thin', className)}>
      {items.map((it) => {
        const active = pathname === it.path || pathname.startsWith(it.path + '/');
        return (
          <NavLink
            key={it.path}
            to={it.path}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              active
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
            {active && (
              <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-primary" />
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

// ─── Grupos ────────────────────────────────────────────
import { Search, Building2, Mail, Globe, Send, RefreshCw, Flame, MessageSquareText, Shield, Rocket, FlaskConical, Bot, Calendar } from 'lucide-react';

export const prospectGroup: GroupNavItem[] = [
  { label: 'Buscar Leads', path: '/prospecting', icon: Search },
  { label: 'Radar CNPJ', path: '/cnpj-radar', icon: Building2 },
  { label: 'Localizador de E-mails', path: '/email-finder', icon: Mail },
  { label: 'Extrator Social', path: '/social-extractor', icon: Globe },
];

export const messagingGroup: GroupNavItem[] = [
  { label: 'Disparo em Massa', path: '/mass-send', icon: Send },
  { label: 'Follow-up', path: '/follow-up', icon: RefreshCw },
  { label: 'Reativação', path: '/cold-reactivation', icon: Flame },
];

export const libraryGroup: GroupNavItem[] = [
  { label: 'Templates', path: '/templates', icon: MessageSquareText },
  { label: 'Quebra de Objeções', path: '/objections', icon: Shield },
  { label: 'Anti-Ban', path: '/antiban', icon: Shield },
];

export const campaignsGroup: GroupNavItem[] = [
  { label: 'Campanhas', path: '/campaigns', icon: Rocket },
  { label: 'Testes A/B', path: '/ab-testing', icon: FlaskConical },
  { label: 'Agente SDR', path: '/sdr-agent', icon: Bot },
  { label: 'Reuniões', path: '/meetings', icon: Calendar },
];
