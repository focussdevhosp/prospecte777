import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, Target, Send, Users, MessageSquare, BarChart3,
  Shield, Settings, Bot, Calendar, Zap, FileText, Globe, Upload,
  Mail, Clock, FlaskConical, Columns3,
  Bell, CreditCard, Code, Search, Kanban,
} from 'lucide-react';
import { useLeadSearch } from '@/hooks/use-lead-search';

interface CommandRoute {
  label: string;
  icon: React.ReactNode;
  path: string;
  group: string;
  keywords?: string;
}

const routes: CommandRoute[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, path: '/dashboard', group: 'Principal', keywords: 'inicio home' },
  { label: 'Prospecção', icon: <Target className="h-4 w-4" />, path: '/prospecting', group: 'Captura', keywords: 'buscar leads capturar google maps web' },
  
  { label: 'CNPJ Radar', icon: <FileText className="h-4 w-4" />, path: '/cnpj-radar', group: 'Captura' },
  { label: 'Localizador de E-mails', icon: <Mail className="h-4 w-4" />, path: '/email-finder', group: 'Captura', keywords: 'puxar e-mail domínio' },
  { label: 'Extrator Social', icon: <Globe className="h-4 w-4" />, path: '/social-extractor', group: 'Captura', keywords: 'instagram facebook' },
  { label: 'Disparo em Massa', icon: <Send className="h-4 w-4" />, path: '/mass-send', group: 'Engajamento', keywords: 'enviar mensagem' },
  { label: 'Campanhas', icon: <Zap className="h-4 w-4" />, path: '/campaigns', group: 'Engajamento' },
  { label: 'Templates', icon: <FileText className="h-4 w-4" />, path: '/templates', group: 'Engajamento' },
  { label: 'A/B Testing', icon: <FlaskConical className="h-4 w-4" />, path: '/ab-testing', group: 'Engajamento' },
  { label: 'Follow-up', icon: <Clock className="h-4 w-4" />, path: '/follow-up', group: 'Engajamento' },
  { label: 'Anti-Ban', icon: <Shield className="h-4 w-4" />, path: '/antiban', group: 'Engajamento' },
  { label: 'Pipeline', icon: <Kanban className="h-4 w-4" />, path: '/crm/pipeline', group: 'CRM', keywords: 'funil kanban' },
  { label: 'Inbox', icon: <MessageSquare className="h-4 w-4" />, path: '/crm/inbox', group: 'CRM', keywords: 'chat whatsapp conversas' },
  { label: 'Contatos', icon: <Users className="h-4 w-4" />, path: '/crm/contacts', group: 'CRM', keywords: 'leads clientes' },
  { label: 'Atividades', icon: <Calendar className="h-4 w-4" />, path: '/crm/activities', group: 'CRM', keywords: 'reuniões tarefas' },
  { label: 'Automações', icon: <Zap className="h-4 w-4" />, path: '/crm/automations', group: 'CRM' },
  { label: 'CRM Analytics', icon: <BarChart3 className="h-4 w-4" />, path: '/crm/analytics', group: 'CRM' },
  { label: 'Agente SDR', icon: <Bot className="h-4 w-4" />, path: '/sdr-agent', group: 'Ferramentas' },
  { label: 'Reuniões', icon: <Calendar className="h-4 w-4" />, path: '/meetings', group: 'Ferramentas' },
  { label: 'Analytics', icon: <BarChart3 className="h-4 w-4" />, path: '/analytics', group: 'Ferramentas' },
  { label: 'Configurações', icon: <Settings className="h-4 w-4" />, path: '/settings', group: 'Sistema', keywords: 'config preferencias' },
  { label: 'Notificações', icon: <Bell className="h-4 w-4" />, path: '/settings/notifications', group: 'Sistema' },
  { label: 'Billing', icon: <CreditCard className="h-4 w-4" />, path: '/billing', group: 'Sistema', keywords: 'plano assinatura pagamento' },
  { label: 'API Reference', icon: <Code className="h-4 w-4" />, path: '/api-reference', group: 'Sistema' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  // Busca de leads. O Ctrl+K só encontrava telas — para achar um cliente
  // pelo nome era preciso ir ao CRM, abrir Contatos e filtrar. Num app de
  // vendas, procurar contato é a busca mais frequente que existe.
  const { results: leadResults, isSearching } = useLeadSearch(query);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Limpa a busca ao fechar, senão o resultado antigo aparece por um
  // instante na próxima abertura.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const handleSelect = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const groups = [...new Set(routes.map(r => r.group))];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar leads, páginas, ações..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isSearching ? 'Buscando...' : 'Nenhum resultado encontrado.'}
        </CommandEmpty>

        {leadResults.length > 0 && (
          <>
            <CommandGroup heading="Leads">
              {leadResults.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={`lead-${lead.id}`}
                  onSelect={() => handleSelect(`/crm/contacts/${lead.id}`)}
                  className="gap-2 cursor-pointer"
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">{lead.business_name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {lead.phone_display || lead.phone}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {groups.map((group, i) => (
          <div key={group}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {routes.filter(r => r.group === group).map((route) => (
                <CommandItem
                  key={route.path}
                  value={`${route.label} ${route.keywords || ''}`}
                  onSelect={() => handleSelect(route.path)}
                  className="gap-2 cursor-pointer"
                >
                  {route.icon}
                  <span>{route.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

// Export setter for external trigger
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
