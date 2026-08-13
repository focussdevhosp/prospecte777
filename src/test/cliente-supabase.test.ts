import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { refDoProjeto } from '../integrations/supabase/client';

// ============================================================
// SUBSTITUI `supabase-target.test.ts`
// ============================================================
// Aquele arquivo protegia o desenho antigo, em que a variável de ambiente
// escolhia o projeto e uma lista de refs abandonados desviava do caso
// conhecido. Seis das sete intenções dele continuam aqui.
//
// UMA FOI INVERTIDA DE PROPÓSITO, e vale registrar porque é uma decisão, não
// um esquecimento. O teste antigo dizia:
//
//   "um destino novo e legítimo continua tendo a palavra final — trocar de
//    banco segue sendo configuração, não edição de código"
//
// Não é verdade neste repositório. O `types.ts` é gerado a partir de um
// projeto específico, as migrações foram aplicadas nele e as edge functions
// estão publicadas nele. Apontar para outro banco mexendo só numa variável
// de ambiente produz um app que compila, sobe, e quebra na primeira consulta
// — com erro de tabela inexistente, que não diz a ninguém que a causa foi um
// campo no painel do deploy.
//
// Trocar de projeto continua possível. Passa a ser o que sempre foi de fato:
// uma mudança de código, junto com o `types.ts` novo.

const CLIENT = readFileSync('src/integrations/supabase/client.ts', 'utf-8');
const ENV = readFileSync('.env', 'utf-8');

/** O ref declarado no código, que é a autoridade. */
const PROJETO = CLIENT.match(/const PROJETO = '([a-z0-9]+)'/)?.[1] ?? '';

describe('refDoProjeto', () => {
  it('tira o ref da URL do Supabase', () => {
    expect(refDoProjeto('https://sciphxtbxvbpiypbcxub.supabase.co')).toBe('sciphxtbxvbpiypbcxub');
    expect(refDoProjeto('https://oeztpxyprifabkvysroh.supabase.co/rest/v1')).toBe('oeztpxyprifabkvysroh');
  });

  it('não inventa ref quando não há URL', () => {
    // Ausência tem que ser distinguível de divergência: sem variável, não há
    // nada a conferir e o app usa o do código em silêncio, como deve.
    expect(refDoProjeto(undefined)).toBeNull();
    expect(refDoProjeto('')).toBeNull();
    expect(refDoProjeto('https://exemplo.com')).toBeNull();
  });
});

describe('a configuração do repositório não pode divergir do código', () => {
  it('o código declara um projeto', () => {
    expect(PROJETO).toMatch(/^[a-z0-9]{20}$/);
  });

  it('o .env aponta para o MESMO projeto que o código', () => {
    // Se estes dois divergirem, o desenvolvedor local roda contra um banco e
    // o build roda contra outro — e a diferença só aparece quando uma tabela
    // "não existe" numa máquina e existe na outra.
    const refDoEnv = refDoProjeto(ENV.match(/VITE_SUPABASE_URL="?([^"\n]+)"?/)?.[1]);
    expect(refDoEnv).toBe(PROJETO);
  });

  it('o VITE_SUPABASE_PROJECT_ID também bate', () => {
    expect(ENV.match(/VITE_SUPABASE_PROJECT_ID="?([a-z0-9]+)"?/)?.[1]).toBe(PROJETO);
  });
});

describe('o remendo antigo não pode voltar', () => {
  it('não existe mais lista de projetos abandonados', () => {
    // A lista pegava UM endereço conhecido e precisava de manutenção a cada
    // migração de banco. A conferência por divergência pega qualquer um e não
    // precisa de lista nenhuma.
    //
    // Procura a DECLARAÇÃO, não a menção: o comentário que explica por que a
    // lista saiu precisa poder citá-la pelo nome. Foi o mesmo tropeço do
    // guarda de estágios, e a lição é a mesma — documentação nomeia o
    // defeito, e um guarda que confunde as duas coisas atrapalha quem explica.
    expect(CLIENT).not.toMatch(/const\s+PROJETOS_ABANDONADOS/);
  });

  it('a variável de ambiente não escolhe o projeto', () => {
    // Ela CONFERE. Se voltar a escolher, um valor errado no painel do deploy
    // derruba o app de novo — foi assim que a tela de login morreu com erro
    // de cota de um projeto que já nem era o nosso.
    expect(CLIENT).not.toMatch(/const SUPABASE_URL\s*=\s*.*import\.meta\.env/);
  });

  it('a divergência é reportada como erro, não como aviso', () => {
    // Aviso discreto some no meio do console e a divergência atravessa meses
    // enquanto o app funciona por causa da correção.
    expect(CLIENT).toMatch(/console\.error\([\s\S]{0,200}VITE_SUPABASE_URL/);
  });
});

describe('nunca uma chave de servidor no frontend', () => {
  it('a chave embutida é publicável, não service_role', () => {
    const chave = CLIENT.match(/const SUPABASE_PUBLISHABLE_KEY = '([^']+)'/)?.[1] ?? '';
    expect(chave).toMatch(/^sb_publishable_/);
    expect(chave).not.toContain('service_role');
  });

  it('o arquivo não menciona service_role a não ser para recusá-la', () => {
    const ocorrencias = [...CLIENT.matchAll(/service_role/g)].length;
    expect(ocorrencias).toBeGreaterThan(0);
    expect(CLIENT).toContain('nunca pode ir para o frontend');
  });
});
