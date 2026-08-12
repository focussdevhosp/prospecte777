import { describe, it, expect } from 'vitest';
import {
  pickAssignee,
  podeReatribuir,
  type Member,
} from '../../supabase/functions/_shared/agents/assignment';

const m = (userId: string, openLoad: number, extra: Partial<Member> = {}): Member => ({
  userId, openLoad, active: true, ...extra,
});

describe('pickAssignee — carga é o padrão, e não rodízio', () => {
  it('escolhe quem tem menos lead aberto', () => {
    // Rodízio distribui quantidade igual; carga distribui trabalho igual.
    // Quem tem 200 abertos e recebe a mesma fatia de quem tem 10 acumula uma
    // fila que nunca vai atender — e lead parado na fila de alguém é pior que
    // lead sem dono, porque parece atendido.
    const r = pickAssignee([m('ana', 200), m('bruno', 10), m('caio', 45)]);
    expect(r.userId).toBe('bruno');
    expect(r.reason).toContain('Menor carga');
  });

  it('empate é resolvido de forma reproduzível', () => {
    const primeira = pickAssignee([m('zeca', 5), m('ana', 5)]);
    const segunda = pickAssignee([m('ana', 5), m('zeca', 5)]);
    expect(primeira.userId).toBe(segunda.userId);
  });
});

describe('pickAssignee — quem não pode receber', () => {
  it('inativo fica fora do rodízio', () => {
    // Férias, saiu da empresa, ainda não configurou o WhatsApp.
    const r = pickAssignee([m('ana', 0, { active: false }), m('bruno', 80)]);
    expect(r.userId).toBe('bruno');
  });

  it('teto é respeitado antes de qualquer estratégia', () => {
    // Quem está cheio está cheio, e a distribuição mais justa não muda isso.
    const r = pickAssignee([m('ana', 50, { capacity: 50 }), m('bruno', 90)]);
    expect(r.userId).toBe('bruno');
  });

  it('todos no teto devolve ninguém, com o motivo', () => {
    // Devolver alguém assim mesmo criaria uma fila invisível.
    const r = pickAssignee([m('ana', 50, { capacity: 50 }), m('bruno', 50, { capacity: 50 })]);
    expect(r.userId).toBeNull();
    expect(r.reason).toContain('teto');
  });

  it('equipe vazia não quebra', () => {
    expect(pickAssignee([]).userId).toBeNull();
    expect(pickAssignee([]).reason.length).toBeGreaterThan(20);
  });
});

describe('pickAssignee — nicho', () => {
  it('especialista tem preferência sobre generalista', () => {
    // Um especialista em clínicas fecha mais clínica. Distribuição "justa"
    // que ignora isso troca receita por simetria.
    const r = pickAssignee(
      [m('ana', 3), m('bruno', 40, { niches: ['clínica'] })],
      { strategy: 'nicho', niche: 'Clínicas de Estética' },
    );
    expect(r.userId).toBe('bruno');
  });

  it('entre especialistas, ganha o de menor carga', () => {
    const r = pickAssignee(
      [m('ana', 30, { niches: ['clínica'] }), m('bruno', 5, { niches: ['clínica'] })],
      { strategy: 'nicho', niche: 'clínica odontológica' },
    );
    expect(r.userId).toBe('bruno');
  });

  it('sem especialista, cai na carga em vez de não atribuir', () => {
    // Melhor alguém que ninguém: lead sem dono não é abordado.
    const r = pickAssignee(
      [m('ana', 3), m('bruno', 40)],
      { strategy: 'nicho', niche: 'pet shop' },
    );
    expect(r.userId).toBe('ana');
  });
});

describe('pickAssignee — rodízio', () => {
  it('gira entre os disponíveis', () => {
    const equipe = [m('ana', 0), m('bruno', 0), m('caio', 0)];
    const escolhidos = [0, 1, 2, 3].map(c => pickAssignee(equipe, { strategy: 'rodizio', counter: c }).userId);
    expect(new Set(escolhidos.slice(0, 3)).size).toBe(3);
    expect(escolhidos[3]).toBe(escolhidos[0]);
  });
});

describe('podeReatribuir — conversa não troca de mãos', () => {
  it('lead sem dono pode receber um', () => {
    expect(podeReatribuir({ assigned_to: null }).pode).toBe(true);
  });

  it('lead que JÁ RESPONDEU não muda de dono', () => {
    // Trocar a pessoa no meio do diálogo faz o cliente recomeçar a explicar
    // tudo, e o vendedor perder o contexto que construiu.
    const r = podeReatribuir({ assigned_to: 'ana', last_response_at: '2026-08-12T10:00:00Z' });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain('recomeçar a explicar');
  });

  it('negociação em andamento não troca de mãos', () => {
    for (const stage of ['Proposta', 'Negociação', 'Ganho']) {
      expect(podeReatribuir({ assigned_to: 'ana', stage }).pode, stage).toBe(false);
    }
  });

  it('lead atribuído mas sem conversa pode ser rebalanceado', () => {
    // Rebalancear carteira é bom; rebalancear conversa é dano.
    expect(podeReatribuir({ assigned_to: 'ana', stage: 'Contato' }).pode).toBe(true);
  });

  it('toda decisão traz motivo', () => {
    const casos = [
      { assigned_to: null },
      { assigned_to: 'ana', last_response_at: '2026-01-01' },
      { assigned_to: 'ana', stage: 'Proposta' },
      { assigned_to: 'ana', stage: 'Contato' },
    ];
    for (const c of casos) {
      expect(podeReatribuir(c).motivo.length).toBeGreaterThan(8);
    }
  });
});
