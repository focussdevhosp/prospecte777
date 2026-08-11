import { describe, it, expect } from 'vitest';
import { nextActions, idleMessage, type CommandMetrics } from '../lib/next-actions';

const zerado: CommandMetrics = {
  found_today: 0,
  qualified_today: 0,
  contacted_today: 0,
  replied_today: 0,
  meetings_today: 0,
  awaiting_approval: 0,
  awaiting_reply: 0,
  overdue_followups: 0,
  hot_leads: 0,
  handoffs_pending: 0,
  paused_missions: 0,
  automation_errors: 0,
  outbound_paused: false,
  ai_cost_today: 0,
};

const m = (p: Partial<CommandMetrics>): CommandMetrics => ({ ...zerado, ...p });

describe('nextActions — a ordem é a ordem do dinheiro', () => {
  it('sem nada pendente, não inventa tarefa', () => {
    expect(nextActions(zerado)).toEqual([]);
  });

  it('bloqueio vem antes de tudo', () => {
    // Com o envio pausado, revisar rascunho é encher uma fila que não escoa.
    const acoes = nextActions(m({ outbound_paused: true, awaiting_approval: 40, hot_leads: 12 }));

    expect(acoes[0].id).toBe('outbound-paused');
    expect(acoes[0].urgency).toBe('bloqueio');
  });

  it('quem já respondeu vem antes de quem está quente', () => {
    // O lead que escreveu está com o celular na mão agora. O quente pode
    // esperar até a tarde; o que perguntou, não.
    const acoes = nextActions(m({ awaiting_reply: 3, hot_leads: 20 }));

    expect(acoes[0].id).toBe('awaiting-reply');
    expect(acoes.findIndex(a => a.id === 'hot')).toBeGreaterThan(0);
  });

  it('escalação da IA entra como "agora"', () => {
    // A IA parou e chamou gente. Ou o caso é grande, ou ela não conseguiria
    // responder sem inventar — os dois pedem alguém hoje.
    const acoes = nextActions(m({ handoffs_pending: 2 }));
    expect(acoes[0].urgency).toBe('agora');
  });

  it('follow-up vencido é o último da fila', () => {
    const acoes = nextActions(
      m({ awaiting_reply: 1, hot_leads: 1, awaiting_approval: 1, overdue_followups: 30 }),
    );
    expect(acoes[acoes.length - 1].id).toBe('followups');
  });

  it('corta em quatro: dez prioridades não priorizam nada', () => {
    const acoes = nextActions(
      m({
        outbound_paused: true,
        paused_missions: 2,
        automation_errors: 5,
        awaiting_reply: 10,
        handoffs_pending: 3,
        hot_leads: 8,
        awaiting_approval: 20,
        overdue_followups: 40,
      }),
    );
    expect(acoes.length).toBe(4);
  });

  it('toda ação tem destino e motivo', () => {
    const acoes = nextActions(
      m({ outbound_paused: true, awaiting_reply: 2, hot_leads: 3, awaiting_approval: 4 }),
    );

    for (const acao of acoes) {
      expect(acao.href.startsWith('/'), acao.id).toBe(true);
      expect(acao.cta.length, acao.id).toBeGreaterThan(3);
      // O "por quê" é o que diferencia isto de uma lista de números.
      expect(acao.why.length, acao.id).toBeGreaterThan(40);
    }
  });
});

describe('idleMessage', () => {
  it('distingue "em dia" de "não rodou"', () => {
    // Num painel de zeros as duas situações parecem iguais, e são opostas:
    // uma é boa notícia, a outra quer dizer que a operação não aconteceu.
    const naoRodou = idleMessage(zerado);
    const emDia = idleMessage(m({ found_today: 40, contacted_today: 12, replied_today: 3 }));

    expect(naoRodou).toContain('Nada aconteceu hoje');
    expect(emDia).toContain('continuam rodando');
    expect(naoRodou).not.toBe(emDia);
  });
});
