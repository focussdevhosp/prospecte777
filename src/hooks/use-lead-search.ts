import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Busca de leads por nome, telefone ou e-mail.
 *
 * A busca roda no banco e não sobre a lista já carregada: o app carrega os
 * leads recentes, então filtrar em memória só acha quem já estava na tela —
 * exatamente o contrário do que uma busca precisa fazer.
 */
export interface LeadSearchResult {
  id: string;
  business_name: string;
  phone: string;
  phone_display?: string;
  email: string | null;
  stage: string;
  temperature: string | null;
}

/** Só dígitos, sem código de país — casa telefone digitado em qualquer formato. */
function phoneFragment(query: string): string | null {
  const digits = query.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;
}

export function useLeadSearch(query: string, limit = 6) {
  const { user } = useAuth();
  const [debounced, setDebounced] = useState('');

  // Sem debounce, cada tecla digitada vira uma consulta ao banco.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = !!user?.id && debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ['lead-search', user?.id, debounced],
    queryFn: async () => {
      if (!user?.id) return [];

      const term = debounced.replace(/[%,()]/g, ' ').trim();
      const digits = phoneFragment(debounced);

      const filters = [
        `business_name.ilike.%${term}%`,
        `email.ilike.%${term}%`,
      ];
      if (digits) filters.push(`phone.ilike.%${digits}%`);

      const { data, error } = await supabase
        .from('leads')
        .select('id, business_name, phone, email, stage, temperature')
        .eq('user_id', user.id)
        .or(filters.join(','))
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as LeadSearchResult[];
    },
    enabled,
    staleTime: 1000 * 30,
  });

  return {
    results: enabled ? data ?? [] : [],
    isSearching: enabled && isFetching,
  };
}
