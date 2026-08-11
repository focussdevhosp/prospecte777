import { describe, it, expect } from 'vitest';
import {
  decideFollowUp,
  parseFutureDate,
} from '../../supabase/functions/_shared/agents/follow-up-policy';

const AGORA = new Date('2026-08-11T12:00:00');

const base = {
  now: AGORA,
  daysSinceContact: 10,
  followUpCount: 1,
  maxFollowUps: 5,
  repliedAfterLastContact: false,
};

describe('parseFutureDate', () => {
  it('entende data ISO no futuro', () => {
    expect(parseFutureDate('retomar em 2026-09-15', AGORA)?.getMonth()).toBe(8);
  });

  it('ignora data ISO que já passou', () => {
    expect(parseFutureDate('falamos em 2026-01-05', AGORA)).toBeNull();
  });

  it('entende DD/MM e joga para o ano que vem quando já passou', () => {
    const passado = parseFutureDate('me chama dia 05/03', AGORA);
    expect(passado?.getFullYear()).toBe(2027);
    expect(passado?.getMonth()).toBe(2);
  });

  it('nome de mês vira a PRÓXIMA ocorrência', () => {
    // "me chama em março", dito em agosto, é o março que vem. Interpretar
    // como o que já passou faria o sistema ligar no dia seguinte.
    const marco = parseFutureDate('me chama em março', AGORA);
    expect(marco?.getFullYear()).toBe(2027);

    const setembro = parseFutureDate('depois de setembro', AGORA);
    expect(setembro?.getFullYear()).toBe(2026);
  });

  it('sem data reconhecível devolve null em vez de chutar', () => {
    // Chutar aqui significaria calar por meses sem o lead ter pedido.
    expect(parseFutureDate('depois a gente vê', AGORA)).toBeNull();
  });
});

describe('decideFollowUp', () => {
  it('lead que respondeu não recebe follow-up: a bola está com a gente', () => {
    const d = decideFollowUp({ ...base, repliedAfterLastContact: true });
    expect(d.action).toBe('esperar');
  });

  it('recusa explícita encerra', () => {
    const d = decideFollowUp({
      ...base,
      memories: [{ memory_type: 'objection', key: 'recusa', value: 'não tenho interesse', confidence: 0.9 }],
    });
    expect(d.action).toBe('encerrar');
  });

  it('"pare de mandar mensagem" encerra', () => {
    const d = decideFollowUp({
      ...base,
      memories: [{ memory_type: 'objection', key: 'opt out', value: 'pare de me mandar mensagem', confidence: 1 }],
    });
    expect(d.action).toBe('encerrar');
  });

  it('compromisso com data ganha do calendário do sistema', () => {
    // É a regra que separa um agente que escuta de um que cobra. Sem ela, a
    // pessoa que pediu "me chama em setembro" leva três mensagens em agosto.
    const d = decideFollowUp({
      ...base,
      daysSinceContact: 60,
      memories: [
        { memory_type: 'commitment', key: 'retomar', value: 'me chama em setembro', confidence: 0.9 },
      ],
    });
    expect(d.action).toBe('esperar');
    expect(d.waitUntil?.getMonth()).toBe(8);
    expect(d.reason).toContain('pediu para ser procurado');
  });

  it('adiamento sem data espera 30 dias, não encerra', () => {
    // "Esse mês não dá" não é "não quero". Encerrar aqui joga fora um lead
    // que só está sem caixa agora.
    const d = decideFollowUp({
      ...base,
      memories: [{ memory_type: 'objection', key: 'timing', value: 'esse mês não dá', confidence: 0.8 }],
    });
    expect(d.action).toBe('esperar');
    expect(d.waitUntil!.getTime()).toBeGreaterThan(AGORA.getTime());
  });

  it('memória incerta não decide nada', () => {
    // Confiança baixa vem de dedução, não do que a pessoa disse. Deixar isso
    // encerrar um lead seria descartar carteira por palpite.
    const d = decideFollowUp({
      ...base,
      memories: [{ memory_type: 'objection', key: 'recusa', value: 'não quero', confidence: 0.3 }],
    });
    expect(d.action).toBe('enviar');
  });

  it('lead quente que sumiu vai para uma pessoa', () => {
    const d = decideFollowUp({ ...base, temperature: 'quente', followUpCount: 2 });
    expect(d.action).toBe('transferir');
  });

  it('lead frio que sumiu segue no automático', () => {
    const d = decideFollowUp({ ...base, temperature: 'frio', followUpCount: 2 });
    expect(d.action).toBe('enviar');
  });

  it('esgotada a cadência, encerra', () => {
    const d = decideFollowUp({ ...base, followUpCount: 5, maxFollowUps: 5, temperature: 'frio' });
    expect(d.action).toBe('encerrar');
  });

  it('respeita o espaçamento da cadência', () => {
    // Primeiro toque no dia 1, segundo no dia 3, terceiro no dia 7.
    expect(decideFollowUp({ ...base, followUpCount: 0, daysSinceContact: 0 }).action).toBe('esperar');
    expect(decideFollowUp({ ...base, followUpCount: 0, daysSinceContact: 1 }).action).toBe('enviar');
    expect(decideFollowUp({ ...base, followUpCount: 1, daysSinceContact: 2 }).action).toBe('esperar');
    expect(decideFollowUp({ ...base, followUpCount: 1, daysSinceContact: 3 }).action).toBe('enviar');
  });

  it('a recusa vence o compromisso, mesmo com data marcada', () => {
    // Quem marcou data e depois recusou, recusou. A ordem das regras é a
    // ordem da prioridade.
    const d = decideFollowUp({
      ...base,
      memories: [
        { memory_type: 'commitment', key: 'retomar', value: 'me chama em setembro', confidence: 0.9 },
        { memory_type: 'objection', key: 'recusa', value: 'não me manda mais nada', confidence: 0.9 },
      ],
    });
    expect(d.action).toBe('encerrar');
  });

  it('todo caminho devolve motivo legível', () => {
    // O motivo vai para o feed. "skip" não explica nada a quem abre a tela.
    for (const memories of [
      null,
      [{ memory_type: 'objection', value: 'não quero', confidence: 1 }],
      [{ memory_type: 'commitment', value: 'me chama em setembro', confidence: 1 }],
    ]) {
      const d = decideFollowUp({ ...base, memories });
      expect(d.reason.length).toBeGreaterThan(20);
    }
  });
});
