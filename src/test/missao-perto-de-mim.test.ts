import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIO_MAX_KM } from '../../supabase/functions/_shared/sources';
import { RAIOS_KM } from '../components/prospecting/PertoDeMim';

const ler = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf-8');

const ORQUESTRADOR = ler('supabase/functions/sales-orchestrator/index.ts');
const DIALOGO = ler('src/components/missions/NewMissionDialog.tsx');
const MIGRACAO = ler(
  'supabase/migrations/20260815120000_b1c2d3e4-0029-4b33-9229-000000000029.sql',
);

/**
 * A missão é o fluxo que roda SOZINHA depois — dias depois, sem ninguém
 * olhando. Um centro errado aqui não devolve erro na cara de quem clicou:
 * devolve uma leva de leads do lugar errado, com aparência de acerto.
 */
describe('perto de mim na missão', () => {
  it('o teto de 300 km é o mesmo nos três lugares que o definem', () => {
    // Este é o defeito que mais assusta: a tela oferece 300, o banco aceita
    // até 250 e a busca corta em 200. Ninguém vê nada quebrar — só chegam
    // menos resultados do que a pessoa pediu, e a conta nunca fecha.
    const maiorDaTela = Math.max(...RAIOS_KM);

    expect(maiorDaTela).toBe(RAIO_MAX_KM);

    const faixaDoBanco = MIGRACAO.match(/center_radius_km BETWEEN (\d+) AND (\d+)/);
    expect(faixaDoBanco).not.toBeNull();
    expect(Number(faixaDoBanco![2])).toBe(RAIO_MAX_KM);

    const faixaDaFuncao = ORQUESTRADOR.match(/raioKm >= 1 && raioKm <= (\d+)/);
    expect(faixaDaFuncao).not.toBeNull();
    expect(Number(faixaDaFuncao![1])).toBe(RAIO_MAX_KM);
  });

  it('a função recusa o centro ANTES de gravar, com recado em português', () => {
    // Sem esta checagem quem falha é a constraint do Postgres, e a pessoa
    // recebe "violates check constraint missions_centro_valido" na tela.
    const validacao = ORQUESTRADOR.indexOf('code: "center_invalid"');
    const gravacao = ORQUESTRADOR.indexOf('center_lat: centro?.lat');

    expect(validacao).toBeGreaterThan(-1);
    expect(gravacao).toBeGreaterThan(-1);
    expect(validacao).toBeLessThan(gravacao);

    expect(ORQUESTRADOR).toContain('!(lat === 0 && lng === 0)');
  });

  it('(0,0) é recusado nos dois lados — é leitura falha, não coordenada', () => {
    // Fica no Golfo da Guiné. A busca varreria oceano e voltaria vazia, e
    // "não há empresas aqui" seria a conclusão errada mais convincente.
    expect(MIGRACAO).toContain('NOT (center_lat = 0 AND center_lng = 0)');
    expect(ORQUESTRADOR).toContain('!(lat === 0 && lng === 0)');
  });

  it('as três colunas andam juntas ou nenhuma existe', () => {
    // Ponto sem raio, ou raio sem ponto, produz uma busca impossível.
    expect(MIGRACAO).toContain('missions_centro_completo');
    expect(MIGRACAO).toMatch(/center_lat IS NULL AND center_lng IS NULL AND center_radius_km IS NULL/);
  });

  it('a busca da missão usa o centro GRAVADO, não o de quem a disparou', () => {
    // A missão roda em cron. Se lesse a posição de quem executa, prospectaria
    // em volta do servidor.
    expect(ORQUESTRADOR).toMatch(/centro:\s*mission\.center_lat != null/);
    expect(ORQUESTRADOR).toContain('lat: Number(mission.center_lat)');
  });

  it('cidade deixa de ser obrigatória quando há centro, nos dois lados', () => {
    // Coordenada já é uma área. Exigir cidade junto travaria quem está num
    // lugar cujo nome o reverso não devolveu.
    expect(ORQUESTRADOR).toContain('!city && !str(body.region) && !temCentro');
    expect(DIALOGO).toContain("(city.trim().length >= 2 || !!centro)");
  });

  it('a missão nasce com o lugar escrito, mesmo no modo raio', () => {
    // O campo fica desabilitado; sem isto o card da missão viria em branco.
    expect(DIALOGO).toMatch(/city:\s*centro \?/);
  });
});
