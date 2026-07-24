import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BrazilState {
  id: number;
  code: string;
  name: string;
  region: string;
}

interface BrazilCity {
  id: number;
  state_code: string;
  name: string;
  ibge_code: number | null;
}

interface CepRange {
  id: number;
  state_code: string;
  city_name: string | null;
  cep_start: string;
  cep_end: string;
  region_name: string | null;
}

interface LocationSuggestion {
  type: 'state' | 'city' | 'cep';
  value: string;
  label: string;
  state_code?: string;
  state_name?: string;
}

export function useBrazilLocations() {
  const [states, setStates] = useState<BrazilState[]>([]);
  const [cities, setCities] = useState<BrazilCity[]>([]);
  const [cepRanges, setCepRanges] = useState<CepRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Load states on mount
  useEffect(() => {
    const fetchStates = async () => {
      const { data } = await supabase
        .from('brazil_states')
        .select('*')
        .order('name');
      
      if (data) {
        setStates(data as BrazilState[]);
      }
    };

    const fetchCepRanges = async () => {
      const { data } = await supabase
        .from('brazil_cep_ranges')
        .select('*');
      
      if (data) {
        setCepRanges(data as CepRange[]);
      }
    };

    Promise.all([fetchStates(), fetchCepRanges()]).finally(() => {
      setLoading(false);
    });
  }, []);

  // Search cities - prioritize exact/prefix matches over substring matches
  const searchCities = async (term: string): Promise<BrazilCity[]> => {
    const clean = term.trim();
    if (clean.length < 2) return [];

    const { data } = await supabase
      .from('brazil_cities')
      .select('*')
      .ilike('name', `%${clean}%`)
      .order('name')
      .limit(200);

    const rows = (data || []) as BrazilCity[];
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const target = normalize(clean);

    const scored = rows.map((c) => {
      const n = normalize(c.name);
      let score = 4;
      if (n === target) score = 0;
      else if (n.startsWith(target + ' ') || n === target) score = 1;
      else if (n.startsWith(target)) score = 2;
      else if (n.split(/\s+/).some((w) => w.startsWith(target))) score = 3;
      return { c, score };
    });

    scored.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name));
    return scored.slice(0, 30).map((s) => s.c);
  };

  // Get cities by state
  const getCitiesByState = async (stateCode: string): Promise<BrazilCity[]> => {
    const { data } = await supabase
      .from('brazil_cities')
      .select('*')
      .eq('state_code', stateCode)
      .order('name');

    return (data || []) as BrazilCity[];
  };

  // Get state from CEP
  const getStateFromCep = (cep: string): BrazilState | undefined => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return undefined;

    const cepNum = parseInt(cleanCep);
    
    for (const range of cepRanges) {
      const start = parseInt(range.cep_start.replace(/\D/g, ''));
      const end = parseInt(range.cep_end.replace(/\D/g, ''));
      
      if (cepNum >= start && cepNum <= end) {
        return states.find(s => s.code === range.state_code);
      }
    }
    
    return undefined;
  };

  // Format CEP
  const formatCep = (cep: string): string => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length <= 5) return clean;
    return `${clean.slice(0, 5)}-${clean.slice(5, 8)}`;
  };

  // Check if input is a CEP
  const isCep = (input: string): boolean => {
    const clean = input.replace(/\D/g, '');
    return clean.length >= 5 && clean.length <= 8 && /^\d+$/.test(clean);
  };

  // Generate suggestions based on search term
  const getSuggestions = useMemo(() => {
    return async (term: string): Promise<LocationSuggestion[]> => {
      const suggestions: LocationSuggestion[] = [];
      const lowerTerm = term.toLowerCase().trim();

      if (!lowerTerm) return [];

      // Check if it's a CEP search
      if (isCep(term)) {
        const state = getStateFromCep(term);
        if (state) {
          suggestions.push({
            type: 'cep',
            value: formatCep(term),
            label: `CEP ${formatCep(term)} - ${state.name}`,
            state_code: state.code,
            state_name: state.name,
          });
        } else if (term.replace(/\D/g, '').length >= 5) {
          suggestions.push({
            type: 'cep',
            value: formatCep(term),
            label: `CEP ${formatCep(term)}`,
          });
        }
      }

      // Search states
      const matchingStates = states.filter(
        s => s.name.toLowerCase().includes(lowerTerm) || 
             s.code.toLowerCase() === lowerTerm
      );
      
      for (const state of matchingStates.slice(0, 5)) {
        suggestions.push({
          type: 'state',
          value: `${state.name}, ${state.code}`,
          label: `${state.name} (${state.code}) - ${state.region}`,
          state_code: state.code,
          state_name: state.name,
        });
      }

      // Search cities if term is long enough
      if (lowerTerm.length >= 2) {
        const matchingCities = await searchCities(lowerTerm);
        
        for (const city of matchingCities.slice(0, 10)) {
          const state = states.find(s => s.code === city.state_code);
          suggestions.push({
            type: 'city',
            value: `${city.name}, ${city.state_code}`,
            label: `${city.name}, ${state?.name || city.state_code}`,
            state_code: city.state_code,
            state_name: state?.name,
          });
        }
      }

      return suggestions;
    };
  }, [states, cepRanges]);

  // Popular cities for quick selection
  const popularCities: LocationSuggestion[] = [
    { type: 'city', value: 'São Paulo, SP', label: 'São Paulo, SP', state_code: 'SP', state_name: 'São Paulo' },
    { type: 'city', value: 'Rio de Janeiro, RJ', label: 'Rio de Janeiro, RJ', state_code: 'RJ', state_name: 'Rio de Janeiro' },
    { type: 'city', value: 'Belo Horizonte, MG', label: 'Belo Horizonte, MG', state_code: 'MG', state_name: 'Minas Gerais' },
    { type: 'city', value: 'Curitiba, PR', label: 'Curitiba, PR', state_code: 'PR', state_name: 'Paraná' },
    { type: 'city', value: 'Porto Alegre, RS', label: 'Porto Alegre, RS', state_code: 'RS', state_name: 'Rio Grande do Sul' },
    { type: 'city', value: 'Salvador, BA', label: 'Salvador, BA', state_code: 'BA', state_name: 'Bahia' },
    { type: 'city', value: 'Fortaleza, CE', label: 'Fortaleza, CE', state_code: 'CE', state_name: 'Ceará' },
    { type: 'city', value: 'Recife, PE', label: 'Recife, PE', state_code: 'PE', state_name: 'Pernambuco' },
    { type: 'city', value: 'Brasília, DF', label: 'Brasília, DF', state_code: 'DF', state_name: 'Distrito Federal' },
    { type: 'city', value: 'Goiânia, GO', label: 'Goiânia, GO', state_code: 'GO', state_name: 'Goiás' },
  ];

  return {
    states,
    cities,
    loading,
    searchTerm,
    setSearchTerm,
    getSuggestions,
    getCitiesByState,
    getStateFromCep,
    formatCep,
    isCep,
    popularCities,
  };
}
