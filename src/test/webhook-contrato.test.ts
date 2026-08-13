import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const HUNTER = readFileSync('supabase/functions/hunter/index.ts', 'utf-8');
const WEBHOOK = readFileSync('supabase/functions/webhook/index.ts', 'utf-8');

/**
 * Um webhook é contrato com um sistema de terceiro — CRM, automação,
 * planilha. Mentir para ele é pior que mentir para uma tela: a tela alguém
 * confere; o outro sistema registra e segue.
 */
describe('webhook só anuncia o que aconteceu', () => {
  it('"lead_contacted" exige que a mensagem tenha saído', () => {
    // Disparava em TODOS os caminhos: WhatsApp desconectado, envio recusado,
    // exceção no meio. O sistema do cliente registrava um contato que nunca
    // houve.
    expect(HUNTER).toMatch(/if\s*\(settings\.webhook_url\s*&&\s*enviouDeVerdade\)/);
  });

  it('a bandeira só vira verdadeira no ramo em que o envio foi aceito', () => {
    const marca = HUNTER.indexOf('enviouDeVerdade = true');
    expect(marca).toBeGreaterThan(0);

    // Tem que estar depois do `else` do `if (sendError)`, ou seja, no caminho
    // em que o envio NÃO deu erro.
    const antes = HUNTER.slice(Math.max(0, marca - 300), marca);
    expect(antes).toContain('sendError');
    expect(antes).toContain('} else {');
  });

  it('não sobrou log fingindo envio', () => {
    expect(HUNTER).not.toMatch(/would send/i);
  });

  it('"meeting_scheduled" continua dentro do sucesso da criação', () => {
    // Este já estava certo; o teste existe para não regredir junto.
    const i = WEBHOOK.indexOf('event: "meeting_scheduled"');
    expect(i).toBeGreaterThan(0);
    // A guarda fica 23 linhas acima; a janela precisa alcançá-la sem
    // depender de o arquivo não crescer no meio.
    const antes = WEBHOOK.slice(0, i);
    const guarda = antes.lastIndexOf('!meetingError && meeting');
    expect(guarda).toBeGreaterThan(0);
    // E nada fecha o bloco entre a guarda e o disparo.
    expect(antes.slice(guarda)).not.toMatch(/^\s{14}\}\s*$/m);
  });
});
