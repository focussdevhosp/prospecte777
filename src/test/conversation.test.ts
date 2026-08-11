import { describe, it, expect } from 'vitest';
import {
  buildConversationEvidence,
  renderConversationEvidence,
  numbersIn,
} from '../../supabase/functions/_shared/agents/conversation';
import { checkFactuality } from '../../supabase/functions/_shared/agents/quality-gate';

const lead = {
  business_name: 'Clínica Bella Itu',
  niche: 'Clínicas de Estética',
  location: 'Itu - SP',
  website: null,
  rating: 4.6,
  reviews_count: 128,
  site_audit: {
    findings: [
      { title: 'Site sem versão para celular', detail: 'A página quebra em telas menores que 480px' },
    ],
  },
};

describe('numbersIn', () => {
  it('normaliza vírgula decimal para bater com o formato do gate', () => {
    expect(numbersIn('R$ 3.500,00 por mês')).toContain('3.500');
    expect(numbersIn('faturo 40 mil')).toContain('40');
  });

  it('texto sem número devolve lista vazia', () => {
    expect(numbersIn('quero saber mais sobre o serviço')).toEqual([]);
  });
});

describe('buildConversationEvidence', () => {
  it('o número que o LEAD disse pode ser repetido pelo agente', () => {
    // É a decisão central deste módulo. Se repetir o que a pessoa acabou de
    // dizer fosse tratado como invenção, a checagem barraria justamente a
    // resposta mais atenta possível — e ninguém iria querer usá-la.
    const evidence = buildConversationEvidence({
      lead,
      messages: [
        { sender_type: 'agent', content: 'Como está o movimento hoje?' },
        { sender_type: 'lead', content: 'Hoje eu faturo uns 40 mil por mês' },
      ],
    });

    const veredito = checkFactuality(
      'Você comentou que fatura 40 mil por mês — o gargalo é captação ou retenção?',
      evidence,
    );
    expect(veredito.approved).toBe(true);
  });

  it('número que ninguém disse continua sendo invenção', () => {
    const evidence = buildConversationEvidence({
      lead,
      messages: [{ sender_type: 'lead', content: 'quanto custa?' }],
    });

    const veredito = checkFactuality(
      'Clientes como você costumam ter 35% mais agendamentos no primeiro mês.',
      evidence,
    );
    expect(veredito.approved).toBe(false);
    expect(veredito.issues.some((i) => i.code === 'unsourced_number')).toBe(true);
  });

  it('não empresta credibilidade ao número que o AGENTE mesmo escreveu antes', () => {
    // Senão bastaria a IA inventar uma vez para o número virar "fato" e
    // poder ser repetido para sempre — a mentira se lavando no histórico.
    const evidence = buildConversationEvidence({
      lead,
      messages: [
        { sender_type: 'agent', content: 'A gente costuma entregar 47% mais leads' },
        { sender_type: 'lead', content: 'interessante' },
      ],
    });

    expect(evidence.allowedNumbers).not.toContain('47');
  });

  it('a avaliação do Google pode ser citada: alguém observou', () => {
    const evidence = buildConversationEvidence({ lead });
    expect(evidence.allowedNumbers).toContain('4.6');
    expect(evidence.allowedNumbers).toContain('128');
  });

  it('memória de confiança baixa não vira fato afirmável', () => {
    const evidence = buildConversationEvidence({
      lead,
      memories: [
        { memory_type: 'budget', key: 'orçamento', value: '5000', confidence: 0.4 },
        { memory_type: 'need', key: 'dor', value: 'agenda vazia às terças', confidence: 0.9 },
      ],
    });

    expect(evidence.allowedNumbers).not.toContain('5000');
    expect(evidence.factValues).toContain('agenda vazia às terças');
  });

  it('sem preço no catálogo, falar de preço é bloqueio', () => {
    const semPreco = buildConversationEvidence({ lead, services: [{ pricing_info: null }] });
    expect(semPreco.hasPricing).toBe(false);

    const veredito = checkFactuality('Fica R$ 1.200 por mês.', semPreco);
    expect(veredito.approved).toBe(false);
  });

  it('repetir o valor do lead é escutar; cravar preço com ele é outra coisa', () => {
    // A distinção que mais custa acertar. O lead dizer um número autoriza
    // repeti-lo, não autoriza transformá-lo em proposta comercial — preço
    // que ninguém cadastrou é preço inventado, mesmo saindo da boca do lead.
    const evidence = buildConversationEvidence({
      lead,
      messages: [{ sender_type: 'lead', content: 'consigo investir uns 500 por mês' }],
      services: [{ pricing_info: null }],
    });

    expect(
      checkFactuality('Você falou em 500 por mês — é esse o teto mesmo?', evidence).approved,
    ).toBe(true);

    expect(
      checkFactuality('Perfeito, fica 500 por mês então.', evidence).approved,
    ).toBe(false);
  });

  it('perguntar sobre orçamento não é cravar preço', () => {
    // Qualificar é o trabalho do agente. Se perguntar "cabe 500 no seu
    // orçamento?" fosse bloqueado, a conferência estaria atrapalhando
    // exatamente a pergunta que faz a venda andar.
    const evidence = buildConversationEvidence({ lead, services: [{ pricing_info: null }] });

    expect(
      checkFactuality('Seu orçamento pra isso tá na faixa de 500 por mês?', evidence).approved,
    ).toBe(true);
  });

  it('a hipótese vira pergunta — que é a saída que o prompt manda usar', () => {
    // O prompt diz: "HIPÓTESE não é fato. Se quiser usar, vire pergunta."
    // Enquanto o gate reprovava as duas formas igual, essa saída era uma
    // armadilha: o modelo obedecia à instrução e continuava barrado.
    const evidence = buildConversationEvidence({ lead });

    expect(
      checkFactuality('Vocês estão perdendo agendamento por causa disso.', evidence).approved,
    ).toBe(false);

    expect(
      checkFactuality('Costuma acontecer de perder agendamento assim — é o caso de vocês?', evidence)
        .approved,
    ).toBe(true);
  });

  it('"custa 2 minutos do seu tempo" não é preço', () => {
    const evidence = buildConversationEvidence({ lead, services: [{ pricing_info: null }] });

    expect(
      checkFactuality('Me custa 2 minutos te explicar. Posso?', evidence).approved,
    ).toBe(true);
  });

  it('com preço cadastrado, falar de preço é permitido', () => {
    const comPreco = buildConversationEvidence({
      lead,
      services: [{ pricing_info: 'A partir de R$ 1.200/mês' }],
    });
    expect(comPreco.hasPricing).toBe(true);
  });

  it('portfólio publicado autoriza citar trabalho anterior', () => {
    const semPortfolio = buildConversationEvidence({ lead, portfolioCount: 0 });
    const comPortfolio = buildConversationEvidence({ lead, portfolioCount: 3 });

    expect(semPortfolio.hasCaseStudies).toBe(false);
    expect(comPortfolio.hasCaseStudies).toBe(true);
  });

  it('sem portfólio, citar cliente anterior é bloqueado', () => {
    const evidence = buildConversationEvidence({ lead, portfolioCount: 0 });
    const veredito = checkFactuality(
      'Acabei de fazer pra uma clínica parecida aqui da região.',
      evidence,
    );
    expect(veredito.approved).toBe(false);
    expect(veredito.issues.some((i) => i.code === 'fabricated_proof')).toBe(true);
  });

  it('achado da auditoria pode ser afirmado', () => {
    const evidence = buildConversationEvidence({ lead });
    expect(evidence.factValues).toContain('Site sem versão para celular');
  });

  it('promessa de resultado garantido é bloqueada mesmo com tudo cadastrado', () => {
    const evidence = buildConversationEvidence({
      lead,
      portfolioCount: 5,
      services: [{ pricing_info: 'R$ 2.000', case_studies: ['case A'] }],
    });

    const veredito = checkFactuality('Garanto que o resultado vem rápido.', evidence);
    expect(veredito.approved).toBe(false);
    expect(veredito.issues.some((i) => i.code === 'guarantee')).toBe(true);
  });

  it('mensagem sem número e sem promessa passa', () => {
    const evidence = buildConversationEvidence({ lead });
    const veredito = checkFactuality(
      'Faz sentido. Posso te mandar como eu faria no caso de vocês?',
      evidence,
    );
    expect(veredito.approved).toBe(true);
  });
});

describe('renderConversationEvidence', () => {
  it('separa o que foi observado do que foi deduzido', () => {
    const texto = renderConversationEvidence(
      [{ label: 'Empresa', value: 'Clínica Bella Itu', source: 'cadastro do lead' }],
      [{ statement: 'pode estar perdendo agendamentos', basedOn: 'análise automática' }],
    );

    expect(texto).toContain('FATOS OBSERVADOS');
    expect(texto).toContain('HIPÓTESES');
    // A origem sai junto do fato: sem ela o agente afirma sem saber por quê.
    expect(texto).toContain('[fonte: cadastro do lead]');
    // A hipótese sai com a instrução colada, não solta numa lista.
    expect(texto).toContain('vire pergunta');
  });

  it('sem fato nenhum, diz isso em vez de deixar a seção vazia', () => {
    // Seção vazia num prompt é convite para o modelo preencher sozinho.
    const texto = renderConversationEvidence([], []);
    expect(texto).toContain('Nada observado');
    expect(texto).toContain('Nenhuma.');
  });
});
