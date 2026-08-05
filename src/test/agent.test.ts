import { describe, it, expect } from 'vitest';
import {
  classifyInbound,
  formatMemory,
  withinBusinessHours,
} from '../../supabase/functions/_shared/agent';

describe('classifyInbound — opt-out', () => {
  it('reconhece pedidos de parada', () => {
    for (const msg of [
      'pare de mandar mensagem',
      'PARE DE ENVIAR MENSAGENS',
      'não quero',
      'nao tenho interesse',
      'não me mande mais nada',
      'me tira da lista',
      'quero descadastrar',
      'isso é spam',
      'sair',
      'STOP',
      'vou bloquear esse número',
    ]) {
      expect(classifyInbound(msg).kind, msg).toBe('opt_out');
    }
  });

  it('não confunde palavra dentro de outra', () => {
    // "separe" contém "pare"; "sairemos" contém "sair"
    expect(classifyInbound('pode separe os documentos').kind).not.toBe('opt_out');
    expect(classifyInbound('sairemos amanhã cedo').kind).not.toBe('opt_out');
  });

  it('opt-out tem prioridade sobre handoff', () => {
    // Contém sinal de irritação e pedido de parada — parada vence.
    const r = classifyInbound('que absurdo, não me mande mais mensagens');
    expect(r.kind).toBe('opt_out');
  });
});

describe('classifyInbound — handoff', () => {
  it('reconhece pedido de humano', () => {
    for (const msg of [
      'quero falar com uma pessoa',
      'me passa para um atendente',
      'posso conversar com o responsável?',
      'você é um robô?',
      'isso é bot né',
    ]) {
      expect(classifyInbound(msg).kind, msg).toBe('handoff');
    }
  });

  it('reconhece sinal de fechamento', () => {
    for (const msg of ['quero fechar', 'vamos contratar', 'fechado, pode fazer']) {
      expect(classifyInbound(msg).kind, msg).toBe('handoff');
    }
  });

  it('reconhece cliente irritado e risco jurídico', () => {
    expect(classifyInbound('que palhaçada isso').kind).toBe('handoff');
    expect(classifyInbound('vou acionar meu advogado').kind).toBe('handoff');
    expect(classifyInbound('vou no procon').kind).toBe('handoff');
  });
});

describe('classifyInbound — normal', () => {
  it('deixa passar conversa comum', () => {
    for (const msg of [
      'oi, tudo bem?',
      'quanto custa?',
      'me manda mais informações',
      'legal, gostei da proposta',
      'qual o prazo de entrega?',
    ]) {
      expect(classifyInbound(msg).kind, msg).toBe('normal');
    }
  });

  it('trata vazio como normal', () => {
    expect(classifyInbound('').kind).toBe('normal');
  });
});

describe('formatMemory', () => {
  it('descarta memória de baixa confiança', () => {
    const out = formatMemory([
      { memory_type: 'personal', key: 'nome', value: 'João', confidence: 0.9 },
      { memory_type: 'context', key: 'chute', value: 'talvez', confidence: 0.2 },
    ]);
    expect(out).toContain('João');
    expect(out).not.toContain('talvez');
  });

  it('devolve vazio quando não há nada confiável', () => {
    expect(formatMemory([
      { memory_type: 'context', key: 'a', value: 'b', confidence: 0.1 },
    ])).toBe('');
    expect(formatMemory([])).toBe('');
  });

  it('agrupa por seção', () => {
    const out = formatMemory([
      { memory_type: 'personal', key: 'nome', value: 'Ana', confidence: 1 },
      { memory_type: 'objection', key: 'preco', value: 'achou caro', confidence: 1 },
    ]);
    expect(out).toContain('Sobre a pessoa');
    expect(out).toContain('Objeções já levantadas');
  });

  it('limita a 8 itens por seção para não inchar o prompt', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      memory_type: 'context', key: `k${i}`, value: `v${i}`, confidence: 1,
    }));
    const out = formatMemory(many);
    expect(out.split('\n- ').length - 1).toBe(8);
  });
});

describe('withinBusinessHours', () => {
  it('respeita a janela configurada', () => {
    // Janela impossível (start === end) nunca está aberta
    expect(withinBusinessHours({ auto_start_hour: 9, auto_end_hour: 9 })).toBe(false);
    // Janela de 24h está sempre aberta
    expect(withinBusinessHours({ auto_start_hour: 0, auto_end_hour: 24 })).toBe(true);
  });

  it('bloqueia fim de semana quando work_days_only está ligado', () => {
    const brasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const isWeekend = brasilia.getUTCDay() === 0 || brasilia.getUTCDay() === 6;
    const result = withinBusinessHours({
      auto_start_hour: 0, auto_end_hour: 24, work_days_only: true,
    });
    expect(result).toBe(!isWeekend);
  });
});
