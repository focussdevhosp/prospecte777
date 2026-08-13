import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O vocabulário de estágio do funil, exatamente como o CHECK da tabela
 * `leads` define. Qualquer outro valor faz o Postgres recusar a linha.
 */
const ESTAGIOS = ['Contato', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido'];

/** Os outros vocabulários com CHECK na mesma tabela. */
const VOCABULARIOS: Record<string, string[]> = {
  stage: ESTAGIOS,
  temperature: ['quente', 'morno', 'frio'],
  agent_status: ['active', 'paused', 'handoff', 'opted_out'],
};

function arquivos(dir: string, ext: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, ext, saida);
    else if (nome.endsWith(ext)) saida.push(caminho);
  }
  return saida;
}

describe('estágio que o código grava tem que existir no banco', () => {
  // O orquestrador gravava `stage: "Abordado"` depois de cada envio
  // bem-sucedido. "Abordado" nunca esteve no CHECK, então o Postgres recusava
  // o UPDATE INTEIRO — e como ninguém conferia o erro, `message_sent`,
  // `first_contact_at` e `last_contact_at` também deixavam de ser gravados.
  //
  // O pior era o `last_contact_at`: é dele que o follow-up calcula há quantos
  // dias o lead está sem resposta. Sem ele, todo lead abordado ficaria
  // elegível a follow-up de imediato, e de novo a cada rodada.
  //
  // Ficou dormente porque só dispara em envio bem-sucedido, e nenhum envio
  // havia acontecido ainda.
  const fontes = [
    ...arquivos('supabase/functions', '.ts'),
    ...arquivos('src', '.ts'),
    ...arquivos('src', '.tsx'),
  ];

  it('nenhuma escrita usa estágio fora do vocabulário', () => {
    const invalidos: string[] = [];

    for (const arquivo of fontes) {
      // O próprio guarda cita o valor errado no comentário que explica por
      // que ele existe. Sem esta exceção, ele acusaria a si mesmo.
      if (arquivo.includes('estagios.test')) continue;

      const conteudo = readFileSync(arquivo, 'utf-8');

      for (const [i, bruta] of conteudo.split('\n').entries()) {
        // Comentário mencionando o defeito não é escrita. A documentação
        // precisa poder nomear o que deu errado sem virar erro de teste.
        //
        // Corte por posição, não por regex: `/\/\/.*$/` parecia óbvio e não
        // funcionou aqui, e um guarda que falha em si mesmo não serve para
        // guardar nada.
        const inicioComentario = bruta.indexOf('//');
        const semLinha = inicioComentario >= 0 ? bruta.slice(0, inicioComentario) : bruta;
        const linha = semLinha.trimStart().startsWith('*') ? '' : semLinha;

        // Só as ESCRITAS: `stage: "X"`. Comparação e lista de filtro usam os
        // mesmos nomes e não gravam nada.
        for (const m of linha.matchAll(/\bstage:\s*["']([^"']+)["']/g)) {
          const valor = m[1];
          if (valor.includes('$') || valor.includes('{')) continue;
          if (!ESTAGIOS.includes(valor)) {
            invalidos.push(`${arquivo.replace(/\\/g, '/')}:${i + 1} grava "${valor}"`);
          }
        }
      }
    }

    expect(invalidos).toEqual([]);
  });

  it('o vocabulário tem os seis, na ordem do funil', () => {
    // Se alguém acrescentar um estágio, precisa mexer na migração do CHECK
    // junto — e este teste é onde isso vira conversa em vez de erro em
    // produção.
    expect(ESTAGIOS).toEqual([
      'Contato', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido',
    ]);
  });
});
