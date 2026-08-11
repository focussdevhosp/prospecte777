import { describe, it, expect } from 'vitest';
import { buildDossier, allowedNumbers, renderDossierForPrompt } from '../../supabase/functions/_shared/agents/dossier';
import { qualify } from '../../supabase/functions/_shared/agents/qualifier';
import { matchOffer, offerFromRow } from '../../supabase/functions/_shared/agents/offer-matcher';
import { buildStrategy } from '../../supabase/functions/_shared/agents/strategist';
import { evaluate } from '../../supabase/functions/_shared/agents/quality-gate';
import type { Offer } from '../../supabase/functions/_shared/agents/types';

// ------------------------------------------------------------
// Fixtures — dados fictícios, nada real.
// ------------------------------------------------------------

const leadSemSite = {
  id: 'lead-1',
  business_name: 'Clínica Estética Bella Itu',
  phone: '5511987654321',
  niche: 'Clínicas de Estética',
  location: 'Itu - SP',
  website: null,
  stage: 'Contato',
  rating: 4.1,
  reviews_count: 12,
  source: 'openstreetmap',
};

const leadComSiteRuim = {
  ...leadSemSite,
  id: 'lead-2',
  business_name: 'Odonto Sorriso Sorocaba',
  niche: 'Clínicas Odontológicas',
  location: 'Sorocaba - SP',
  website: 'https://odontosorriso.com.br',
  site_audit: {
    url: 'https://odontosorriso.com.br',
    reachable: true,
    score: 42,
    pitch: 'o site não é adaptado para celular e mais 2 pontos',
    checked_at: '2026-08-10T12:00:00.000Z',
    findings: [
      {
        id: 'not_responsive',
        severity: 'critical',
        title: 'O site não é adaptado para celular',
        impact: 'A maior parte do acesso vem do celular.',
        opportunity: 'Site responsivo',
      },
      {
        id: 'no_whatsapp',
        severity: 'high',
        title: 'Não há botão de WhatsApp no site',
        impact: 'Quem se interessou tem que copiar o número na mão.',
        opportunity: 'Integração de WhatsApp e atendimento automatizado',
      },
    ],
  },
};

const catalogo: Offer[] = [
  offerFromRow({
    id: 'off-site',
    service_name: 'Site profissional',
    service_slug: 'site',
    description: 'Criação de site responsivo com domínio próprio',
    pain_points: ['não tem site', 'site antigo'],
    benefits: ['aparecer no Google', 'site que abre no celular'],
    target_niches: ['Clínicas de Estética', 'Clínicas Odontológicas'],
    case_studies: [],
  }),
  offerFromRow({
    id: 'off-agente',
    service_name: 'Agente de IA para WhatsApp',
    service_slug: 'agente-whatsapp',
    description: 'Atendimento automatizado no WhatsApp',
    pain_points: ['demora no atendimento', 'perde contato'],
    benefits: ['responder na hora'],
    target_niches: ['Clínicas de Estética'],
    case_studies: [],
  }),
  offerFromRow({
    id: 'off-crm',
    service_name: 'CRM',
    service_slug: 'crm',
    description: 'Organização de funil e leads',
    pain_points: ['perde lead', 'sem organização'],
    benefits: ['funil organizado'],
    target_niches: [],
    case_studies: [],
  }),
];

function makePipeline(lead: Record<string, unknown>, allowed?: string[]) {
  const dossier = buildDossier({ lead: lead as never });
  const qualification = qualify(dossier, {
    niches: ['Clínicas de Estética', 'Clínicas Odontológicas'],
    locations: ['Itu', 'Sorocaba'],
  });
  const match = matchOffer(dossier, catalogo, allowed);
  const strategy = buildStrategy({
    dossier,
    qualification,
    match,
    goal: 'agendar_demonstracao',
  });
  return { dossier, qualification, match, strategy };
}

// ------------------------------------------------------------
// DOSSIÊ
// ------------------------------------------------------------

describe('buildDossier — Lead 360 com procedência', () => {
  it('registra a ausência de site como fato e como oportunidade', () => {
    const d = buildDossier({ lead: leadSemSite as never });
    const site = d.facts.find((f) => f.label === 'Site');
    expect(site?.value).toMatch(/não foi encontrado/i);
    expect(d.observedNeeds).toContain('Não tem site próprio');
  });

  it('converte achados da auditoria em fatos com fonte verificável', () => {
    const d = buildDossier({ lead: leadComSiteRuim as never });
    const problems = d.facts.filter((f) => f.label === 'Problema verificado no site');
    expect(problems).toHaveLength(2);
    expect(problems[0].source).toMatch(/auditoria técnica do site/);
    expect(problems[0].confidence).toBe(1);
    expect(d.observedNeeds).toContain('Site responsivo');
  });

  it('separa hipótese de fato — impacto da auditoria nunca vira fato', () => {
    const d = buildDossier({ lead: leadComSiteRuim as never });
    const impacts = d.hypotheses.map((h) => h.statement);
    expect(impacts.some((s) => /celular/i.test(s))).toBe(true);
    expect(d.facts.some((f) => f.value.includes('A maior parte do acesso'))).toBe(false);
  });

  it('trata o que o lead disse como fato de alta confiança', () => {
    const d = buildDossier({
      lead: leadSemSite as never,
      memories: [{ memory_type: 'need', key: 'dor', value: 'perde agendamento por telefone', confidence: 0.9 }],
    });
    const fact = d.facts.find((f) => f.label === 'Necessidade dita pelo lead');
    expect(fact?.source).toBe('conversa com o lead');
    expect(d.observedNeeds).toContain('perde agendamento por telefone');
  });

  it('descarta memória de baixa confiança', () => {
    const d = buildDossier({
      lead: leadSemSite as never,
      memories: [{ memory_type: 'need', key: 'x', value: 'talvez queira site', confidence: 0.2 }],
    });
    expect(d.memory).toHaveLength(0);
  });

  it('extrai só os números que o dossiê autoriza citar', () => {
    const d = buildDossier({ lead: leadSemSite as never });
    const nums = allowedNumbers(d);
    expect(nums).toContain('4.1');
    expect(nums).toContain('12');
    expect(nums).not.toContain('70');
  });

  it('o prompt renderizado separa FATOS de HIPÓTESES', () => {
    const rendered = renderDossierForPrompt(buildDossier({ lead: leadComSiteRuim as never }));
    expect(rendered).toContain('FATOS OBSERVADOS');
    expect(rendered).toContain('HIPÓTESES COMERCIAIS');
    expect(rendered).toMatch(/NÃO afirme/);
  });
});

// ------------------------------------------------------------
// QUALIFICAÇÃO
// ------------------------------------------------------------

describe('qualify — score explicável', () => {
  it('toda pontuação vem com evidência', () => {
    const { qualification } = makePipeline(leadComSiteRuim);
    expect(qualification.reasons.length).toBeGreaterThan(0);
    for (const r of qualification.reasons) {
      expect(r.evidence.length).toBeGreaterThan(0);
    }
  });

  it('premia problema verificado no site', () => {
    const semSite = makePipeline(leadSemSite).qualification;
    const comProblema = makePipeline(leadComSiteRuim).qualification;
    expect(comProblema.reasons.some((r) => r.label === 'Problemas verificados no site')).toBe(true);
    expect(semSite.reasons.some((r) => r.label === 'Não tem site próprio')).toBe(true);
  });

  it('desqualifica lead sem telefone em vez de dar nota baixa', () => {
    const d = buildDossier({ lead: { ...leadSemSite, phone: null } as never });
    const q = qualify(d);
    expect(q.disqualified).toBe(true);
    expect(q.score).toBe(0);
    expect(q.disqualifiedReason).toMatch(/telefone/i);
  });

  it('respeita exclusão do ICP', () => {
    const d = buildDossier({ lead: leadSemSite as never });
    const q = qualify(d, { exclusions: ['Estética'] });
    expect(q.disqualified).toBe(true);
    expect(q.disqualifiedReason).toMatch(/Excluído pelo ICP/);
  });

  it('é determinístico — mesma entrada, mesma nota', () => {
    const a = makePipeline(leadComSiteRuim).qualification;
    const b = makePipeline(leadComSiteRuim).qualification;
    expect(a.score).toBe(b.score);
  });

  it('lead que respondeu fica mais quente que lead com bom fit que nunca respondeu', () => {
    const ordem = ['frio', 'morno', 'quente', 'muito_quente'];
    const semContato = makePipeline(leadComSiteRuim).qualification;
    const respondeu = qualify(
      buildDossier({
        lead: leadComSiteRuim as never,
        messages: [
          { sender_type: 'agent', content: 'oi' },
          { sender_type: 'lead', content: 'quanto custa?' },
        ],
        memories: [{ memory_type: 'interest', key: 'preço', value: 'perguntou preço', confidence: 0.9 }],
      }),
      {},
    );
    // Comportamento vale mais que fit: quem respondeu sobe de faixa.
    expect(ordem.indexOf(respondeu.temperature)).toBeGreaterThan(
      ordem.indexOf(semContato.temperature),
    );
    expect(['quente', 'muito_quente']).toContain(respondeu.temperature);
  });

  it('lead nunca contatado nunca chega a quente, por melhor que seja o fit', () => {
    const { qualification } = makePipeline(leadComSiteRuim);
    expect(['frio', 'morno']).toContain(qualification.temperature);
  });
});

// ------------------------------------------------------------
// OFFER MATCHER
// ------------------------------------------------------------

describe('matchOffer — uma oferta por lead, com motivo', () => {
  it('escolhe site para quem não tem site', () => {
    const { match } = makePipeline(leadSemSite);
    expect(match.offer?.id).toBe('off-site');
    expect(match.reasons.join(' ')).toMatch(/não tem site próprio/i);
    expect(match.confidence).toBeGreaterThan(40);
  });

  it('liga achado de auditoria à oferta que o resolve', () => {
    const { match } = makePipeline(leadComSiteRuim);
    expect(match.offer).not.toBeNull();
    expect(match.reasons.length).toBeGreaterThan(0);
  });

  it('respeita a lista de ofertas autorizadas na missão', () => {
    const { match } = makePipeline(leadSemSite, ['off-crm']);
    expect(match.offer?.id).toBe('off-crm');
  });

  it('avisa quando não há sinal em vez de fingir confiança', () => {
    const d = buildDossier({
      lead: { id: 'x', business_name: 'Empresa Teste', phone: '5511999999999', website: 'https://ok.com' } as never,
    });
    const m = matchOffer(d, catalogo);
    expect(m.confidence).toBeLessThan(30);
    expect(m.reasons.join(' ')).toMatch(/consultiva|Nenhum sinal/i);
  });

  it('devolve alternativas para o humano discordar', () => {
    const { match } = makePipeline(leadSemSite);
    expect(match.runnersUp.length).toBeGreaterThan(0);
  });

  it('sem catálogo, não inventa oferta', () => {
    const d = buildDossier({ lead: leadSemSite as never });
    const m = matchOffer(d, []);
    expect(m.offer).toBeNull();
    expect(m.reasons[0]).toMatch(/cadastre serviços/i);
  });
});

// ------------------------------------------------------------
// ESTRATÉGIA
// ------------------------------------------------------------

describe('buildStrategy', () => {
  it('usa diagnóstico quando há problema verificado', () => {
    const { strategy } = makePipeline(leadComSiteRuim);
    expect(strategy.angle).toBe('diagnostico');
    expect(strategy.hook?.label).toBe('Problema verificado no site');
  });

  it('cai para abordagem consultiva ou curta quando não sabe nada', () => {
    const d = buildDossier({
      lead: { id: 'x', business_name: 'Empresa Teste', phone: '5511999999999', website: 'https://ok.com' } as never,
    });
    const s = buildStrategy({
      dossier: d,
      qualification: qualify(d),
      match: matchOffer(d, catalogo),
      goal: 'agendar_demonstracao',
    });
    expect(['consultiva', 'curta']).toContain(s.angle);
  });

  it('nunca pede reunião no primeiro contato', () => {
    const { strategy } = makePipeline(leadComSiteRuim);
    expect(strategy.cta).toMatch(/não peça o horário ainda/i);
  });

  it('limita a primeira mensagem a poucas palavras', () => {
    const { strategy } = makePipeline(leadComSiteRuim);
    expect(strategy.maxWords).toBeLessThanOrEqual(55);
  });

  it('registra a justificativa de cada decisão', () => {
    const { strategy } = makePipeline(leadComSiteRuim);
    expect(strategy.rationale.some((r) => r.startsWith('Gancho:'))).toBe(true);
    expect(strategy.rationale.some((r) => r.startsWith('Oferta:'))).toBe(true);
  });

  it('vira follow-up quando já houve contato sem resposta', () => {
    const d = buildDossier({
      lead: { ...leadComSiteRuim, last_contact_at: new Date().toISOString() } as never,
      messages: [{ sender_type: 'agent', content: 'oi' }],
    });
    const s = buildStrategy({ dossier: d, qualification: qualify(d), match: matchOffer(d, catalogo), goal: 'agendar_demonstracao' });
    expect(s.angle).toBe('follow_up');
  });
});

// ------------------------------------------------------------
// QUALITY GATE — o teste que importa
// ------------------------------------------------------------

describe('Quality Gate — factualidade', () => {
  const { dossier, strategy } = makePipeline(leadComSiteRuim);

  const check = (message: string) => evaluate({ message, dossier, strategy });

  it('REPROVA estatística inventada', () => {
    const v = check(
      'Oi! Vi que o site da Odonto Sorriso não abre bem no celular. 70% dos clientes desistem quando isso acontece. Posso te mandar como resolver?',
    );
    expect(v.approved).toBe(false);
    expect(v.issues.some((i) => i.code === 'unsourced_number')).toBe(true);
  });

  it('REPROVA valor em reais inventado', () => {
    const v = check(
      'Opa, o site da Odonto Sorriso não é adaptado para celular. Isso custa uns R$ 5 mil por mês em consulta perdida. Posso te mostrar?',
    );
    expect(v.approved).toBe(false);
    expect(v.issues.some((i) => ['unsourced_number', 'price_without_catalog'].includes(i.code))).toBe(true);
  });

  it('REPROVA prova social fabricada quando não há case cadastrado', () => {
    const v = check(
      'Oi! O site da Odonto Sorriso não é adaptado para celular. Acabei de fazer pra uma clínica parecida e o resultado foi ótimo. Posso te mandar?',
    );
    expect(v.approved).toBe(false);
    expect(v.issues.some((i) => i.code === 'fabricated_proof')).toBe(true);
  });

  it('REPROVA promessa de resultado garantido', () => {
    const v = check(
      'Oi! O site da Odonto Sorriso não é adaptado para celular. Garanto que o resultado vem rápido. Posso te mostrar?',
    );
    expect(v.approved).toBe(false);
    expect(v.issues.some((i) => i.code === 'guarantee')).toBe(true);
  });

  it('REPROVA a mensagem genérica que motivou este projeto', () => {
    const v = check('Olá, tudo bem? Conheci sua empresa e gostaria de apresentar nossos serviços.');
    expect(v.approved).toBe(false);
    expect(v.scores.personalization).toBeLessThan(60);
    expect(v.issues.some((i) => i.code === 'generic_opener')).toBe(true);
  });

  it('REPROVA o fallback antigo do job-processor', () => {
    const v = check(
      'Oi! Curti a Odonto Sorriso e vi que vocês têm poucas avaliações no Google. Tenho um sistema que triplica reviews em 60 dias sem esforço. Posso te mandar como funciona?',
    );
    expect(v.approved).toBe(false);
  });

  it('APROVA mensagem factual construída sobre a auditoria', () => {
    const v = check(
      'Oi! Passei no site da Odonto Sorriso e ele não é adaptado para celular — dá pra conferir abrindo no seu. Trabalho com site responsivo. Posso te mandar como ficaria?',
    );
    expect(v.issues.filter((i) => i.severity === 'block')).toHaveLength(0);
    expect(v.approved).toBe(true);
    expect(v.scores.factuality).toBe(100);
  });

  it('aceita número que veio do dossiê', () => {
    const v = check(
      'Oi! Vi a Odonto Sorriso com 4.1★ e 12 avaliações. O site não é adaptado para celular. Posso te mandar como resolver?',
    );
    expect(v.issues.some((i) => i.code === 'unsourced_number')).toBe(false);
  });

  it('bloqueia reenvio de mensagem quase idêntica', () => {
    const msg = 'Oi! O site da Odonto Sorriso não é adaptado para celular. Posso te mandar como resolver isso?';
    const v = evaluate({ message: msg, dossier, strategy, previousMessages: [msg] });
    expect(v.approved).toBe(false);
    expect(v.issues.some((i) => i.code === 'repeated')).toBe(true);
  });

  it('bloqueia mensagem vazia', () => {
    expect(check('   ').approved).toBe(false);
  });

  it('penaliza mensagem sem pergunta nem pedido', () => {
    const v = check('Oi. O site da Odonto Sorriso não é adaptado para celular. Trabalho com site responsivo.');
    expect(v.issues.some((i) => i.code === 'no_cta')).toBe(true);
  });

  it('detecta risco de spam', () => {
    const v = check(
      'PROMOÇÃO IMPERDÍVEL!! Últimas vagas! Clique aqui agora e ganhe grátis hoje 🔥🔥',
    );
    expect(v.scores.spamRisk).toBeGreaterThan(40);
    expect(v.approved).toBe(false);
  });

  it('reprova texto muito acima do limite da estratégia', () => {
    const v = check(
      'Oi! O site da Odonto Sorriso não é adaptado para celular. ' + 'palavra '.repeat(90) + ' posso te mandar?',
    );
    expect(v.issues.some((i) => i.code === 'too_long')).toBe(true);
  });

  it('não exige oferta quando não há catálogo', () => {
    const d = buildDossier({ lead: leadSemSite as never });
    const m = matchOffer(d, []);
    const s = buildStrategy({ dossier: d, qualification: qualify(d), match: m, goal: 'agendar_demonstracao' });
    const v = evaluate({
      message: 'Oi! Vi a Clínica Estética Bella Itu e reparei que vocês não têm site próprio. Posso te mandar uma ideia?',
      dossier: d,
      strategy: s,
    });
    expect(v.scores.offerAdherence).toBe(100);
  });
});

// ------------------------------------------------------------
// O GATE PRECISA DEIXAR PASSAR
// ------------------------------------------------------------
// Todo aperto no gate carrega o mesmo risco: virar tão rígido que nada sai, e
// aí o produto não manda mensagem ruim porque não manda mensagem nenhuma.
// Falha silenciosa e difícil de perceber — ninguém abre um chamado dizendo
// "minha campanha está educadamente calada".
//
// Estas mensagens são o que um vendedor bom escreveria. Todas precisam
// passar. Se alguma parar de passar, o gate apertou demais, e o teste está
// certo até que se prove o contrário.

describe('Quality Gate — mensagem boa não pode ser barrada', () => {
  const comSite = makePipeline(leadComSiteRuim);
  const semSite = makePipeline(leadSemSite);

  const boas: Array<{ nome: string; msg: string; pipe: ReturnType<typeof makePipeline> }> = [
    {
      nome: 'diagnóstico direto do achado de auditoria',
      msg: 'Oi! Passei no site da Odonto Sorriso e ele não abre direito no celular — dá pra conferir aí no seu. Trabalho com site responsivo. Quer ver como ficaria?',
      pipe: comSite,
    },
    {
      nome: 'segundo achado, com pergunta no lugar de afirmação',
      msg: 'Oi! Reparei que o site da Odonto Sorriso não tem botão de WhatsApp. Quem se interessa acaba tendo que copiar o número na mão. Isso chega a atrapalhar aí?',
      pipe: comSite,
    },
    {
      nome: 'empatia sobre a categoria, sem palpite sobre a empresa',
      msg: 'Oi! Sei que a rotina de clínica é corrida. O site da Odonto Sorriso não é adaptado para celular. Posso te mandar como resolver?',
      pipe: comSite,
    },
    {
      nome: 'números que vieram do dossiê',
      msg: 'Oi! Vi a Odonto Sorriso com 4.1★ e 12 avaliações no Google. O site não abre bem no celular. Quer que eu te mostre?',
      pipe: comSite,
    },
    {
      nome: 'ausência de site tratada como fato',
      msg: 'Oi! Procurei a Clínica Estética Bella Itu e não achei site de vocês. Trabalho com site próprio para clínicas. Faz sentido eu te mostrar uma ideia?',
      pipe: semSite,
    },
    {
      nome: 'gancho seguido de pergunta consultiva',
      msg: 'Oi! Procurei a Clínica Estética Bella Itu e não achei site de vocês. Como as clientes costumam agendar hoje — WhatsApp, Instagram?',
      pipe: semSite,
    },
    {
      nome: 'pede pouco tempo sem cravar valor',
      msg: 'Oi! O site da Odonto Sorriso não é adaptado para celular. Me custa 2 minutos te mostrar como ficaria. Posso?',
      pipe: comSite,
    },
  ];

  it('perguntar como o lead agenda hoje NÃO é pedir reunião', () => {
    // A pergunta de descoberta que mais serve em clínica e salão — os nichos
    // principais do produto — usa a palavra "agendar". Penalizá-la deixava o
    // agente sem poder perguntar como o negócio do outro funciona.
    const descoberta = evaluate({
      message: 'Oi! Procurei a Clínica Estética Bella Itu e não achei site de vocês. Como as clientes costumam agendar hoje?',
      dossier: semSite.dossier,
      strategy: semSite.strategy,
    });
    expect(descoberta.issues.some((i) => i.code === 'premature_meeting')).toBe(false);

    const convite = evaluate({
      message: 'Oi! Procurei a Clínica Estética Bella Itu e não achei site de vocês. Podemos marcar uma call amanhã?',
      dossier: semSite.dossier,
      strategy: semSite.strategy,
    });
    expect(convite.issues.some((i) => i.code === 'premature_meeting')).toBe(true);
  });

  it('"2 minutos" é o tempo do leitor; "em 60 dias" é promessa de resultado', () => {
    const doisMinutos = evaluate({
      message: 'Oi! O site da Odonto Sorriso não abre bem no celular. Me custa 2 minutos te mostrar. Posso?',
      dossier: comSite.dossier,
      strategy: comSite.strategy,
    });
    expect(doisMinutos.scores.factuality).toBe(100);

    const prazo = evaluate({
      message: 'Oi! O site da Odonto Sorriso não abre bem no celular. Isso triplica seus contatos em 60 dias. Posso?',
      dossier: comSite.dossier,
      strategy: comSite.strategy,
    });
    expect(prazo.approved).toBe(false);
  });

  for (const { nome, msg, pipe } of boas) {
    it(`APROVA: ${nome}`, () => {
      const v = evaluate({ message: msg, dossier: pipe.dossier, strategy: pipe.strategy });

      if (!v.approved) {
        const motivos = v.issues
          .filter((i) => i.severity === 'block')
          .map((i) => `${i.code}: ${i.message}${i.excerpt ? ` — "${i.excerpt}"` : ''}`)
          .join('\n');
        throw new Error(`O gate barrou uma mensagem boa:\n${motivos}\n\nNotas: ${JSON.stringify(v.scores)}\n\n${msg}`);
      }

      expect(v.approved).toBe(true);
    });
  }
});
