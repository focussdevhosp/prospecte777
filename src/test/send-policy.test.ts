import { describe, it, expect } from 'vitest';
import {
  classifySendFailure,
  shouldRetrySend,
  MAX_SEND_ATTEMPTS,
} from '../../supabase/functions/_shared/agents/send-policy';

// ------------------------------------------------------------
// Respostas reais do `whatsapp-send`, copiadas do código dele.
// ------------------------------------------------------------

const BLACKLIST_409 = JSON.stringify({
  error: 'Este número pediu para não receber mensagens.',
  code: 'blacklisted',
});
const SEM_CHIP_409 = JSON.stringify({
  error: 'Nenhum chip de WhatsApp disponível. Conecte em Configurações.',
});
const NUMERO_INVALIDO_400 = JSON.stringify({ error: 'Número inválido: 11999' });
const EVOLUTION_502 = JSON.stringify({ error: 'Falha ao enviar a mensagem pelo WhatsApp.' });
const DESCONECTADO_503 = JSON.stringify({ error: 'WhatsApp desconectado. Reconecte em Configurações.' });

describe('classifySendFailure', () => {
  it('reconhece o opt-out pelo corpo, não só pelo código', () => {
    expect(classifySendFailure(409, BLACKLIST_409)).toBe('opt_out');
  });

  it('não confunde falta de chip com opt-out — os dois são 409', () => {
    // O erro que este teste protege: tratar todo 409 como opt-out marcaria
    // como "pediu para não receber" um lead que nunca respondeu nada. Ele
    // sairia da fila para sempre porque a CONTA estava sem chip conectado.
    expect(classifySendFailure(409, SEM_CHIP_409)).toBe('transient');
  });

  it('número inválido é definitivo: repetir dá o mesmo erro', () => {
    expect(classifySendFailure(400, NUMERO_INVALIDO_400)).toBe('definitive');
  });

  it('falha da Evolution e WhatsApp fora do ar são transitórias', () => {
    expect(classifySendFailure(502, EVOLUTION_502)).toBe('transient');
    expect(classifySendFailure(503, DESCONECTADO_503)).toBe('transient');
    expect(classifySendFailure(500, 'erro interno')).toBe('transient');
    expect(classifySendFailure(429, 'devagar')).toBe('transient');
  });

  it('sem resposta nenhuma (timeout, DNS) nunca é definitivo', () => {
    // A mensagem pode nem ter chegado ao servidor. Desistir aqui seria
    // descartar um lead por causa de uma oscilação de rede.
    expect(classifySendFailure(null, null)).toBe('transient');
    expect(classifySendFailure(null, 'connection reset')).toBe('transient');
  });

  it('corpo vazio não quebra a classificação', () => {
    expect(classifySendFailure(409, '')).toBe('transient');
    expect(classifySendFailure(409, undefined)).toBe('transient');
  });
});

describe('shouldRetrySend', () => {
  it('opt-out não se tenta de novo nem na primeira falha', () => {
    // Insistir com quem pediu para parar não é persistência comercial.
    expect(shouldRetrySend('opt_out', 1)).toBe(false);
  });

  it('falha definitiva não se tenta de novo', () => {
    expect(shouldRetrySend('definitive', 1)).toBe(false);
  });

  it('falha transitória se tenta de novo até o teto', () => {
    expect(shouldRetrySend('transient', 1)).toBe(true);
    expect(shouldRetrySend('transient', MAX_SEND_ATTEMPTS - 1)).toBe(true);
  });

  it('para exatamente no teto, não depois', () => {
    expect(shouldRetrySend('transient', MAX_SEND_ATTEMPTS)).toBe(false);
    expect(shouldRetrySend('transient', MAX_SEND_ATTEMPTS + 10)).toBe(false);
  });

  it('o teto é o mesmo que o banco aplica', () => {
    // `mission_lead_send_failed` recebe MAX_SEND_ATTEMPTS como parâmetro. Se
    // este número mudar aqui e não lá, o teto de verdade passa a ser o padrão
    // da função SQL, e ninguém percebe.
    expect(MAX_SEND_ATTEMPTS).toBe(5);
  });
});
