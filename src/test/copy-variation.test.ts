import { describe, it, expect } from 'vitest';
import {
  aberturaDe,
  buildCopyPrompt,
  type CopyContext,
} from '../../supabase/functions/_shared/agents/copywriter';

const base: CopyContext = {
  dossier: {
    leadId: 'lead-1',
    businessName: 'Bar do Farias',
    phone: '5511999999999',
    niche: 'restaurante',
    location: 'Itu - SP',
    website: null,
    stage: 'Contato',
    facts: [{ label: 'Site', value: 'não foi encontrado', source: 'busca automática', confidence: 90 }],
    hypotheses: [],
    observedNeeds: [],
    memory: [],
    conversationSummary: null,
    messageCount: { fromLead: 0, fromAgent: 0 },
    lastContactAt: null,
    lastResponseAt: null,
    origins: ['openstreetmap'],
  },
  strategy: {
    angle: 'diagnostico',
    goal: 'agendar_demonstracao',
    objective: 'abrir conversa',
    cta: 'posso te mostrar?',
    maxWords: 55,
    channel: 'whatsapp',
    hook: { label: 'Site', value: 'não foi encontrado', source: 'busca automática', confidence: 90 },
    rationale: [],
    offer: null,
  } as unknown as CopyContext['strategy'],
  sender: { agentName: 'Ana' },
};

describe('aberturaDe', () => {
  it('pega as primeiras palavras, que é o que se repete', () => {
    expect(aberturaDe('Oi, percebi que o Bar do Farias ainda não tem site próprio. Isso limita.'))
      .toBe('Oi, percebi que o Bar do Farias ainda não');
  });

  it('não quebra com espaço extra nem quebra de linha', () => {
    expect(aberturaDe('  Oi,\n\n  tudo bem  ', 3)).toBe('Oi, tudo bem');
  });

  it('mensagem curta devolve ela inteira', () => {
    expect(aberturaDe('Oi, tudo bem?')).toBe('Oi, tudo bem?');
  });

  it('string vazia não vira lixo', () => {
    expect(aberturaDe('')).toBe('');
    expect(aberturaDe('   ')).toBe('');
  });
});

describe('não repetir a abertura', () => {
  it('sem histórico, o prompt não ganha o bloco', () => {
    // Bloco vazio gastaria tokens e daria uma instrução sem objeto — o
    // modelo tende a "cumprir" inventando diferença onde não precisa.
    const { system } = buildCopyPrompt(base);
    expect(system).not.toContain('NÃO REPITA A ABERTURA');
  });

  it('com histórico, lista o que já foi enviado', () => {
    const { system } = buildCopyPrompt({
      ...base,
      recentOpenings: ['Oi, percebi que o', 'Oi, notei que a'],
    });
    expect(system).toContain('NÃO REPITA A ABERTURA');
    expect(system).toContain('Oi, percebi que o');
    expect(system).toContain('Oi, notei que a');
  });

  it('manda trocar a frase e proíbe trocar o fato', () => {
    // É a linha que separa variedade de invenção. Procurar outro assunto
    // para parecer diferente é pior que repetir o primeiro.
    const { system } = buildCopyPrompt({ ...base, recentOpenings: ['Oi, percebi que o'] });
    expect(system).toContain('CONSTRUÇÃO da frase, não o');
    expect(system).toMatch(/N[ÃA]O\s+procure outro assunto/);
  });

  it('não deixa a lista crescer sem limite', () => {
    // O prompt inteiro compete por espaço com o dossiê, que é o que importa.
    const muitas = Array.from({ length: 20 }, (_, i) => `abertura numero ${i}`);
    const { system } = buildCopyPrompt({ ...base, recentOpenings: muitas });
    expect(system).toContain('abertura numero 0');
    expect(system).not.toContain('abertura numero 9');
  });

  it('ignora entradas vazias em vez de listar aspas soltas', () => {
    const { system } = buildCopyPrompt({ ...base, recentOpenings: ['', '   ', 'Oi, vi que'] });
    expect(system).toContain('Oi, vi que');
    expect(system).not.toContain('- ""...');
  });

  it('a regra de não inventar continua valendo junto', () => {
    const { system } = buildCopyPrompt({ ...base, recentOpenings: ['Oi, percebi que o'] });
    expect(system).toContain('FATOS OBSERVADOS');
    expect(system).toContain('NÃO invente');
  });
});
