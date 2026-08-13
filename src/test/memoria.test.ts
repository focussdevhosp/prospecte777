import { describe, it, expect } from 'vitest';
import { memoriaVazia } from '../../supabase/functions/_shared/agents/conversation';

describe('memoriaVazia — memória que registra ausência é pior que nenhuma', () => {
  it('descarta o caso real que apareceu no teste de ponta a ponta', () => {
    // O extrator gravou isto depois de uma conversa de duas linhas. Entraria
    // no prompt de toda conversa futura ocupando espaço, e seria lido como um
    // fato sobre o cliente — quando o conteúdo é "não sabemos".
    expect(memoriaVazia('produto/serviço não especificado, cliente interessado')).toBe(true);
  });

  it('descarta as formas de "não sei" que o modelo costuma devolver', () => {
    for (const v of [
      'não especificado',
      'nao informado',
      'não mencionado',
      'não identificado',
      'sem informação',
      'desconhecido',
      'N/A',
      'nenhum',
      'indefinido',
      'a definir',
      'não se aplica',
      '',
      '  ',
      '-',
    ]) {
      expect(memoriaVazia(v), JSON.stringify(v)).toBe(true);
    }
  });

  it('NÃO descarta ausência que é informação de verdade', () => {
    // Esta é a linha delicada. "não tem site" é um fato sobre o negócio e o
    // gancho de metade das abordagens deste produto. Um filtro que engolisse
    // isso apagaria justamente o que mais importa.
    for (const v of [
      'não tem site',
      'não usa CRM',
      'não trabalha aos sábados',
      'não quer receber ligação',
      'não tem orçamento até janeiro',
      'sem interesse em chatbot',
    ]) {
      expect(memoriaVazia(v), v).toBe(false);
    }
  });

  it('mantém memória comum', () => {
    for (const v of [
      'João',
      'prefere contato pela manhã',
      'achou caro inicialmente',
      'quer agendar para semana que vem',
      'gestão de redes sociais',
    ]) {
      expect(memoriaVazia(v), v).toBe(false);
    }
  });

  it('acento e maiúscula não mudam a decisão', () => {
    expect(memoriaVazia('NÃO ESPECIFICADO')).toBe(true);
    expect(memoriaVazia('Nao Informado')).toBe(true);
  });

  it('valor nulo não quebra', () => {
    expect(memoriaVazia(null)).toBe(true);
    expect(memoriaVazia(undefined)).toBe(true);
  });
});
