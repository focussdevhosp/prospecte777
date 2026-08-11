// ============================================================
// DE NÚMEROS PARA "O QUE FAZER AGORA"
// ============================================================
// O painel operacional mostrava treze números lado a lado: encontrados,
// qualificados, abordados, respondidos, reuniões, aguardando aprovação,
// aguardando resposta, follow-ups vencidos, leads quentes, escalações,
// missões pausadas, erros, custo.
//
// Treze números com o mesmo peso visual não são um painel, são uma lista.
// Quem abre a tela de manhã não quer saber quantos leads existem — quer saber
// por onde começar. E a resposta muda: com 40 respostas esperando, aprovar
// rascunho é desperdício de tempo; com o envio pausado, nada mais importa.
//
// A ordem abaixo é a ordem do dinheiro, e é deliberada:
//
//   1. o que está QUEBRADO       — enquanto durar, o resto não acontece
//   2. quem já respondeu         — a pessoa está esperando agora
//   3. quem está quente          — janela que fecha
//   4. quem precisa de decisão   — a fila que só anda com humano
//   5. quem vai esfriar          — follow-up vencido
//
// Deixar isto em função pura, fora do componente, é o que permite testar a
// prioridade sem montar tela.

export interface CommandMetrics {
  found_today: number;
  qualified_today: number;
  contacted_today: number;
  replied_today: number;
  meetings_today: number;
  awaiting_approval: number;
  awaiting_reply: number;
  overdue_followups: number;
  hot_leads: number;
  handoffs_pending: number;
  paused_missions: number;
  automation_errors: number;
  outbound_paused: boolean;
  ai_cost_today: number;
}

export type ActionUrgency = 'bloqueio' | 'agora' | 'hoje' | 'quando_der';

export interface NextAction {
  id: string;
  urgency: ActionUrgency;
  title: string;
  /** Por que isto está nesta posição. Aparece na tela. */
  why: string;
  count: number;
  href: string;
  cta: string;
}

/**
 * Traduz os números do painel na fila de trabalho do dia.
 *
 * Devolve no máximo `limit` itens: uma lista de dez "prioridades" não
 * prioriza nada. O que não couber continua visível como número — some da
 * fila, não da tela.
 */
export function nextActions(m: CommandMetrics, limit = 4): NextAction[] {
  const acoes: NextAction[] = [];

  // ---- 1. Bloqueios ----
  // Enquanto qualquer um destes durar, trabalhar no resto é encher uma fila
  // que não escoa.
  if (m.outbound_paused) {
    acoes.push({
      id: 'outbound-paused',
      urgency: 'bloqueio',
      title: 'Os envios estão parados',
      why: 'A parada de emergência está ativa. Nenhuma mensagem sai por nenhum caminho até você retomar.',
      count: 0,
      href: '/missions',
      cta: 'Retomar envios',
    });
  }

  if (m.paused_missions > 0) {
    acoes.push({
      id: 'paused-missions',
      urgency: 'bloqueio',
      title: `${m.paused_missions} missão(ões) pausada(s)`,
      why: 'Missão pausada não processa lote nem envia. Se a pausa não foi intencional, ela está custando o dia inteiro.',
      count: m.paused_missions,
      href: '/missions',
      cta: 'Ver missões',
    });
  }

  if (m.automation_errors > 0) {
    acoes.push({
      id: 'errors',
      urgency: 'bloqueio',
      title: `${m.automation_errors} erro(s) hoje`,
      why: 'Erro de automação costuma repetir a cada rodada do cron. Um olhar agora evita o mesmo erro cem vezes.',
      count: m.automation_errors,
      href: '/missions',
      cta: 'Ver o feed',
    });
  }

  // ---- 2. Gente esperando ----
  // A pessoa do outro lado está com o celular na mão. É a única fila em que
  // a demora custa a venda inteira.
  if (m.awaiting_reply > 0) {
    acoes.push({
      id: 'awaiting-reply',
      urgency: 'agora',
      title: `${m.awaiting_reply} lead(s) esperando resposta`,
      why: 'Escreveram e ainda não foram respondidos. É a fila em que cada hora de atraso custa mais — quem esperou demais responde "já resolvi".',
      count: m.awaiting_reply,
      href: '/crm/inbox',
      cta: 'Responder',
    });
  }

  if (m.handoffs_pending > 0) {
    acoes.push({
      id: 'handoffs',
      urgency: 'agora',
      title: `${m.handoffs_pending} conversa(s) passada(s) para você`,
      why: 'A IA parou e chamou uma pessoa. Foi porque o caso é grande demais, delicado demais, ou porque ela não conseguiria responder sem inventar.',
      count: m.handoffs_pending,
      href: '/sdr-agent',
      cta: 'Assumir',
    });
  }

  // ---- 3. Janela que fecha ----
  if (m.hot_leads > 0) {
    acoes.push({
      id: 'hot',
      urgency: 'hoje',
      title: `${m.hot_leads} lead(s) quente(s)`,
      why: 'Demonstraram interesse recente. Interesse esfria em dias, não em semanas — e esfriado volta ao preço de um lead frio.',
      count: m.hot_leads,
      href: '/oportunidades',
      cta: 'Ver quem',
    });
  }

  // ---- 4. Fila que só anda com humano ----
  if (m.awaiting_approval > 0) {
    acoes.push({
      id: 'approval',
      urgency: 'hoje',
      title: `${m.awaiting_approval} rascunho(s) aguardando você`,
      why: 'No modo assistido, nada sai sem aprovação. Enquanto a fila não anda, a missão está capturando lead que não é abordado.',
      count: m.awaiting_approval,
      href: '/missions',
      cta: 'Revisar',
    });
  }

  // ---- 5. O que vai esfriar ----
  if (m.overdue_followups > 0) {
    acoes.push({
      id: 'followups',
      urgency: 'quando_der',
      title: `${m.overdue_followups} follow-up(s) vencido(s)`,
      why: 'Passou da data combinada. Não é urgente hoje, mas cada dia a mais reduz a chance de o lead lembrar de você.',
      count: m.overdue_followups,
      href: '/follow-up',
      cta: 'Ver a fila',
    });
  }

  return acoes.slice(0, limit);
}

/**
 * Frase de estado quando não há nada na fila.
 *
 * Distingue "está tudo em dia" de "não aconteceu nada" — que parecem iguais
 * num painel de zeros e são situações opostas. A primeira é boa notícia; a
 * segunda quer dizer que a operação não rodou.
 */
export function idleMessage(m: CommandMetrics): string {
  const houveMovimento =
    m.found_today + m.contacted_today + m.replied_today + m.meetings_today > 0;

  if (!houveMovimento) {
    return 'Nada aconteceu hoje ainda: nenhuma empresa capturada, nenhuma abordagem enviada. Se havia missão ativa, vale conferir se ela está rodando.';
  }

  return 'Nada esperando por você. As missões continuam rodando sozinhas — volte quando alguém responder.';
}
