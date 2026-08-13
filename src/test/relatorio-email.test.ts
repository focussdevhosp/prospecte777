import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const REPORT = readFileSync('supabase/functions/send-report/index.ts', 'utf-8');
const EMAIL = readFileSync('supabase/functions/email-send/index.ts', 'utf-8');
const CRON = readFileSync('supabase/functions/cron-tasks/index.ts', 'utf-8');

describe('o relatório por e-mail precisa sair de verdade', () => {
  it('não sobrou TODO fingindo envio', () => {
    // Havia um TODO seguido de dois console.log e um `success: true`. O
    // usuário ligava "Relatório diário por email" nas automações e nunca
    // recebia nada — sem erro, sem pista.
    //
    // A checagem procura um TODO DE VERDADE: linha que começa com ele. É a
    // terceira vez nesta base que um guarda acusa o próprio comentário que
    // explica o defeito, e a documentação precisa poder citar o que deu
    // errado sem virar erro de teste.
    const pendencias = REPORT.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(\/\/|\*)\s*TODO/i.test(l));

    expect(pendencias).toEqual([]);
    expect(REPORT).not.toMatch(/console\.log\([^)]*Would send email/);
  });

  it('usa o email-send, e não fala com o provedor por fora', () => {
    // Um caminho por canal. Foi assim que quatro caminhos diferentes furaram
    // o opt-out no WhatsApp antes.
    expect(REPORT).toContain('functions/v1/email-send');
    expect(REPORT).not.toContain('api.resend.com');
  });

  it('falha de envio NÃO vira success: true', () => {
    expect(REPORT).toMatch(/success:\s*false/);
    expect(REPORT).toContain('email_failed');
  });

  it('devolve os números mesmo quando o e-mail falha', () => {
    // Os números vêm do banco e são verdadeiros com ou sem e-mail. O que não
    // pode é dizer que enviou.
    const bloco = REPORT.slice(REPORT.indexOf('email_failed'), REPORT.indexOf('email_failed') + 400);
    expect(bloco).toContain('report: reportText');
    expect(bloco).toContain('stats');
  });
});

describe('transacional não é prospecção', () => {
  it('o envio transacional só alcança o e-mail da própria conta', () => {
    // A exceção existe para o relatório do dono não ser calado pela parada de
    // emergência, que serve para parar de incomodar LEADS. Se ela pudesse
    // escolher o destino, viraria porta para furar o opt-out.
    expect(EMAIL).toContain('transactional_destination_not_allowed');
    expect(EMAIL).toMatch(/emailDaConta\s*!==\s*destino/);
  });

  it('a parada de emergência não cala o transacional', () => {
    expect(EMAIL).toMatch(/transacional\s*\?\s*null\s*:\s*outboundBlockReason/);
  });

  it('o opt-out continua valendo para tudo que NÃO é transacional', () => {
    expect(EMAIL).toMatch(/if\s*\(!transacional\)\s*\{[\s\S]{0,200}outbound_suppressed/);
  });

  it('o cabeçalho de descadastro fica só na prospecção', () => {
    // Num relatório para o próprio dono, "descadastre-se" convida a desligar
    // o canal pelo qual o sistema fala com ele.
    expect(EMAIL).toMatch(/transacional\s*\?\s*\{\}\s*:\s*\{[\s\S]{0,120}List-Unsubscribe/);
  });
});

describe('o cron conta o que aconteceu, não o que tentou', () => {
  it('reports_sent não conta quem tem a opção ligada', () => {
    expect(CRON).not.toMatch(/results\.reports_sent\s*=\s*usersWithReport/);
  });

  it('confere erro do invoke E o success:false da resposta', () => {
    // `send-report` responde `success: false` com motivo quando o provedor
    // não está configurado, e isso não levanta `error` no invoke.
    const bloco = CRON.slice(CRON.indexOf('send-report'), CRON.indexOf('send-report') + 900);
    expect(bloco).toMatch(/data\.success === false/);
    expect(bloco).toContain('reports_failed');
  });
});
