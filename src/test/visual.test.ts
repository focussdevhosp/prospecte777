import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync('src/index.css', 'utf-8');

function arquivosTsx(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosTsx(caminho, saida);
    else if (nome.endsWith('.tsx')) saida.push(caminho);
  }
  return saida;
}

describe('reduced-motion não pode apagar a tela', () => {
  // A armadilha: as animações de entrada começam em `opacity: 0`. Um
  // `animation: none` global deixaria o app PERMANENTEMENTE VAZIO para quem
  // ativou "reduzir movimento" no sistema — e não aparece em teste nenhum,
  // porque ninguém desenvolve com a preferência ligada.
  const blocos = CSS.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n {2}\}/g) ?? [];

  it('existe pelo menos um bloco tratando a preferência', () => {
    expect(blocos.length).toBeGreaterThan(0);
  });

  it('todo bloco que desliga animação de entrada devolve a opacidade', () => {
    for (const bloco of blocos) {
      const desliga = /animation:\s*none/.test(bloco);
      if (!desliga) continue;

      // Se o bloco menciona qualquer classe de entrada, ele PRECISA devolver
      // opacidade — senão o conteúdo fica invisível para sempre.
      const mexeEmEntrada = /\.animate-|\.stagger|\.page-enter|\.value-changed/.test(bloco);
      if (!mexeEmEntrada) continue;

      expect(/opacity:\s*1/.test(bloco), bloco.slice(0, 120)).toBe(true);
    }
  });

  it('as animações de entrada estão todas cobertas', () => {
    const cobertura = blocos.join('\n');
    for (const classe of [
      '.animate-fade-in',
      '.animate-slide-up',
      '.animate-scale-in',
      '.animate-bounce-in',
      '.animate-count-up',
      '.stagger',
      '.page-enter',
    ]) {
      expect(cobertura, classe).toContain(classe);
    }
  });
});

describe('fundo e texto não podem ser a mesma cor', () => {
  // Cinco lugares tinham `bg-warning text-warning` e `bg-success text-success`.
  // O resultado é uma tarja colorida sem nada escrito dentro — e o pior caso
  // era o aviso de "sem conexão", que existe justamente para ser lido.
  const TOKENS = ['primary', 'secondary', 'destructive', 'success', 'warning', 'info', 'muted', 'accent'];

  it('nenhum componente pinta texto e fundo com o mesmo token', () => {
    const culpados: string[] = [];

    for (const arquivo of arquivosTsx('src')) {
      const conteudo = readFileSync(arquivo, 'utf-8');
      for (const token of TOKENS) {
        // `bg-x` seguido de `text-x` puro (sem `-foreground` e sem opacidade).
        const padrao = new RegExp(`bg-${token}(?![\\w/-])[^"'\`]*?\\btext-${token}(?![\\w/-])`);
        if (padrao.test(conteudo)) culpados.push(`${arquivo}: bg-${token} + text-${token}`);
      }
    }

    expect(culpados).toEqual([]);
  });
});

describe('o sistema visual continua saindo dos tokens', () => {
  it('a paleta define os dois temas', () => {
    expect(CSS).toContain(':root');
    expect(CSS).toContain('.dark');
  });

  it('movimento é token, não número solto em cada lugar', () => {
    for (const token of ['--ease-out', '--duration-fast', '--duration-base']) {
      expect(CSS, token).toContain(token);
    }
  });

  it('a cascata trava o atraso em vez de crescer sem fim', () => {
    // Esperar 1,2s pelo décimo cartão é lentidão disfarçada de refinamento.
    expect(CSS).toContain('nth-child(n+8)');
  });
});
