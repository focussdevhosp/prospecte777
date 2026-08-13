import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const JOB = readFileSync('supabase/functions/job-processor/index.ts', 'utf-8');
const TELA = readFileSync('src/components/prospecting/MassSendProgress.tsx', 'utf-8');

/**
 * O caso real: um lote de 243 leads processou 27 e a tela anunciou mais de
 * 20 enviados. Chegou UMA mensagem no WhatsApp.
 *
 * A verdade estava no log do job o tempo todo — cada item pulado tinha sua
 * linha dizendo "Nada foi enviado". Quem mentiu foi o número grande na tela,
 * que é justamente o que a pessoa olha.
 */
describe('pulado não é enviado', () => {
  it('a decisão de status pergunta por "skipped" ANTES de "success"', () => {
    // Item pulado volta como `{ success: true, skipped: true }` — sucesso da
    // OPERAÇÃO, não envio. Perguntar por `success` primeiro marcava todo
    // pulado como 'sent'.
    // Há outras atribuições de status no arquivo ('sending', por exemplo).
    // A que importa é a que decide pelo RESULTADO do item.
    const linha = JOB.split('\n').find(
      (l) => l.includes('leads[i].status =') && l.includes('result.'),
    ) ?? '';
    expect(linha).toContain('result.skipped');

    const posSkipped = linha.indexOf('result.skipped');
    const posSuccess = linha.indexOf('result.success');
    expect(posSkipped).toBeGreaterThanOrEqual(0);
    expect(posSkipped).toBeLessThan(posSuccess);
  });

  it('enviados e pulados têm contadores separados', () => {
    expect(JOB).toMatch(/sentItems\s*\+\+/);
    expect(JOB).toMatch(/skippedItems\s*\+\+/);
  });

  it('pulado não entra em enviados nem em falhas', () => {
    // Somar aos enviados faz a tela mentir. Somar às falhas assusta sem
    // motivo: o portão barrar uma mensagem ruim é o sistema funcionando.
    // Só o corpo do `if (result.skipped)`, até o `} else`.
    const inicio = JOB.indexOf('if (result.skipped)');
    const bloco = JOB.slice(inicio, JOB.indexOf('} else', inicio));

    expect(bloco).toContain('skippedItems++');
    expect(bloco).not.toContain('sentItems++');
    expect(bloco).not.toContain('failedItems++');
  });
});

describe('a tela mostra o número que a pessoa acha que está lendo', () => {
  it('"Enviados" lê sent_items, não processed_items', () => {
    // `processed_items - failed_items` era a conta antiga, e ela incluía os
    // pulados.
    expect(TELA).toContain('activeJob.sent_items');
    expect(TELA).not.toMatch(/processed_items\s*-\s*\(activeJob\.failed_items/);
  });

  it('bloqueados aparece como categoria própria', () => {
    expect(TELA).toContain('activeJob.skipped_items');
    expect(TELA).toContain('Bloqueados');
  });

  it('bloqueio vem com explicação, não só com número', () => {
    // Número sem causa vira desconfiança: quem vê "25 bloqueados" sem saber
    // por quê conclui que o produto está quebrado.
    expect(TELA).toMatch(/revisão de qualidade|reprovou o texto/);
  });
});
