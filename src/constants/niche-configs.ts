// ============================================================
// TEXTOS QUE O PRODUTO ENTREGA PRONTOS
// ============================================================
// Este arquivo é o que o onboarding grava na biblioteca de templates de todo
// usuário novo. É, na prática, o que o produto ENSINA a mandar.
//
// Os 32 textos anteriores afirmavam coisas que ninguém tinha como sustentar,
// na voz do cliente e para leads reais:
//
//   "outros restaurantes da região aumentaram 40% nos pedidos"
//   "um restaurante similar ao de vocês que triplicou os pedidos em 3 meses"
//   "algumas clínicas parceiras reduziram 60% das faltas"
//   "uma clínica similar que economizou R$ 3.000/mês"
//   "um salão aqui da região que economizou R$ 2.000/mês"
//   "escritórios parceiros captam 10 novos clientes por mês"
//   "lançamos um app de treino que os alunos usam em casa"
//
// Nenhum desses números veio de lugar nenhum, e nenhum desses clientes
// existe. Um usuário que assina o plano hoje recebia essa biblioteca pronta e
// disparava aquilo no primeiro dia, em nome da própria empresa.
//
// A REGRA DESTE ARQUIVO: um texto pode ser fixo, não pode ser falso. Só entra
// aqui o que é verdade para QUALQUER usuário — o que ele oferece (serviço
// dele), o que o sistema observou (a empresa está no Google Maps, tem
// avaliações) e o que já aconteceu entre os dois (houve contato, passou
// tempo). Resultado obtido, percentual, caso de sucesso e cliente anterior
// dependem de dado real e só podem sair do catálogo do próprio usuário —
// nunca daqui.
//
// A troca custa alguma chamatividade. Custa menos que a primeira vez que um
// lead pedir para ver o case que não existe.
// ============================================================

export interface NicheConfig {
  id: string;
  label: string;
  emoji: string;
  defaultLocations: string[];
  funnelStages: string[];
  messageTemplates: {
    first_contact: string;
    followup_1: string;
    followup_2: string;
    reactivation: string;
  };
  agentPersonality: {
    name: string;
    tone: string;
    knowledge_base: string;
    services: string[];
  };
  bestHours: { start: number; end: number };
  weeklyLeadTarget: number;
  intentKeywords: {
    positive: string[];
    price: string[];
    schedule: string[];
    negative: string[];
  };
}

export const NICHE_CONFIGS: Record<string, NicheConfig> = {
  restaurantes: {
    id: 'restaurantes',
    label: 'Restaurantes e Alimentação',
    emoji: '🍽️',
    defaultLocations: ['São Paulo, SP', 'Campinas, SP', 'Guarulhos, SP'],
    funnelStages: ['Primeiro contato', 'Interesse demonstrado', 'Proposta enviada', 'Negociação', 'Cliente', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Olá! Vi o {nome_empresa} no Google Maps e dei uma olhada nas avaliações de vocês 🍽️\n\nTrabalho com restaurantes em presença digital: cardápio online, Google Meu Negócio e delivery.\n\nComo vocês recebem pedido hoje — só pelos aplicativos ou também direto?',
      followup_1: 'Oi {nome_empresa}! 👋 Passei aqui pra saber se você chegou a ver minha mensagem.\n\nSei que a rotina de restaurante é corrida, então vou direto: eu cuido da parte digital pra sobrar tempo na operação.\n\nFaz sentido eu te mandar um exemplo do que faço?',
      followup_2: '{nome_empresa}, essa é minha última mensagem — prometo 🙂\n\nSe não for o momento, sem problema nenhum. Se quiser, me conta o que mais atrapalha hoje e eu digo com sinceridade se consigo ajudar.\n\nQualquer coisa, é só chamar!',
      reactivation: 'Olá {nome_empresa}! Tudo bem por aí? 😊\n\nFaz um tempo desde a nossa última conversa. Como andam as coisas no restaurante?\n\nAinda faz sentido a gente retomar, ou prefere que eu não insista?',
    },
    agentPersonality: {
      name: 'Ana',
      tone: 'amigavel',
      knowledge_base: 'Especialista em marketing digital para restaurantes. Ofereço cardápio digital, gestão de pedidos online, presença no Google, campanhas de delivery e fidelização de clientes.',
      services: ['Cardápio digital', 'Google Meu Negócio', 'Gestão de delivery', 'Redes sociais', 'Fidelização'],
    },
    bestHours: { start: 9, end: 17 },
    weeklyLeadTarget: 50,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'pode', 'vamos', 'quando', 'como funciona', 'me conta mais', 'topo', 'top', 'show', 'ótimo'],
      price: ['quanto custa', 'valor', 'preço', 'investimento', 'quanto é', 'orçamento'],
      schedule: ['agendar', 'reunião', 'call', 'conversar', 'ligar', 'videoconferência', 'quando posso'],
      negative: ['não tenho interesse', 'não quero', 'para', 'chega', 'stop', 'sair', 'bloquear', 'spam'],
    },
  },
  clinicas: {
    id: 'clinicas',
    label: 'Clínicas e Saúde',
    emoji: '🏥',
    defaultLocations: ['São Paulo, SP', 'Osasco, SP', 'Santo André, SP'],
    funnelStages: ['Primeiro contato', 'Interesse', 'Apresentação marcada', 'Proposta', 'Contrato', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Olá! Vi a {nome_empresa} e dei uma olhada nas avaliações de vocês 🏥\n\nTrabalho com clínicas em agendamento online e confirmação automática de consulta.\n\nComo funciona a marcação aí hoje — recepção no telefone, WhatsApp, ou já tem sistema?',
      followup_1: 'Oi {nome_empresa}! 👋 Sei que a rotina da clínica é intensa.\n\nQueria saber se você chegou a ver minha mensagem. O que eu faço é automatizar confirmação e lembrete de consulta.\n\nQuer que eu te mostre como funciona?',
      followup_2: '{nome_empresa}, última mensagem — prometo 😊\n\nSe não for o momento, tudo bem. Mas se falta de confirmação de consulta for uma dor aí, me diz que eu te explico como resolvo.\n\nFico à disposição!',
      reactivation: 'Olá {nome_empresa}! Tudo bem? 😊\n\nFaz um tempo desde o nosso contato. Como está a agenda da clínica ultimamente?\n\nAinda faz sentido conversarmos, ou prefere que eu não insista?',
    },
    agentPersonality: {
      name: 'Dr. Carlos',
      tone: 'profissional',
      knowledge_base: 'Especialista em gestão digital para clínicas médicas. Ofereço agendamento online, confirmação automática de consultas, redução de faltas, marketing médico e presença digital.',
      services: ['Agendamento online', 'Confirmação automática', 'Redução de faltas', 'Marketing médico', 'Telemedicina'],
    },
    bestHours: { start: 8, end: 17 },
    weeklyLeadTarget: 30,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'pode', 'vamos', 'quando', 'como funciona', 'me conta mais'],
      price: ['quanto custa', 'valor', 'preço', 'investimento', 'orçamento'],
      schedule: ['agendar', 'reunião', 'call', 'conversar', 'visita', 'apresentação'],
      negative: ['não tenho interesse', 'não quero', 'para', 'chega', 'stop', 'sair'],
    },
  },
  academias: {
    id: 'academias',
    label: 'Academias e Fitness',
    emoji: '💪',
    defaultLocations: ['São Paulo, SP', 'Guarulhos, SP', 'Mogi das Cruzes, SP'],
    funnelStages: ['Contato inicial', 'Interessado', 'Demo agendada', 'Proposta', 'Aluno', 'Não converteu'],
    messageTemplates: {
      first_contact: 'E aí {nome_empresa}! 💪\n\nVi a academia de vocês por aqui. Trabalho com academias em retenção de aluno: acompanhamento de evolução e comunicação automática.\n\nComo vocês acompanham quem começa a faltar hoje?',
      followup_1: 'Oi {nome_empresa}! 👊 Sei que a rotina da academia é corrida.\n\nQueria retomar o contato — o que eu faço é acompanhamento de evolução do aluno, que ajuda a segurar quem estava sumindo.\n\nPosso te mandar um vídeo de como funciona?',
      followup_2: '{nome_empresa}, última tentativa 🏋️\n\nSe não for o momento, sem problema. Se cancelamento for um incômodo aí, me chama que eu explico como eu ataco isso.\n\nSucesso aí!',
      reactivation: 'Fala {nome_empresa}! Tudo certo? 💪\n\nPassou um tempo desde o nosso contato. Como andam as coisas na academia?\n\nAinda faz sentido a gente retomar?',
    },
    agentPersonality: {
      name: 'Rafael',
      tone: 'energetico',
      knowledge_base: 'Especialista em tecnologia para academias. Ofereço app de treino personalizado, gestão de alunos, redução de cancelamentos, acompanhamento de evolução e marketing fitness.',
      services: ['App de treino', 'Gestão de alunos', 'Redução de cancelamentos', 'Marketing fitness', 'Personal trainer digital'],
    },
    bestHours: { start: 7, end: 20 },
    weeklyLeadTarget: 40,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'top', 'show', 'bora', 'vamos', 'quando'],
      price: ['quanto custa', 'valor', 'preço', 'mensalidade', 'plano'],
      schedule: ['agendar', 'reunião', 'call', 'visita', 'demo'],
      negative: ['não quero', 'para', 'chega', 'stop', 'sair', 'bloquear'],
    },
  },
  saloes: {
    id: 'saloes',
    label: 'Salões de Beleza',
    emoji: '💇',
    defaultLocations: ['São Paulo, SP', 'Santo André, SP', 'Diadema, SP'],
    funnelStages: ['Contato', 'Interesse', 'Proposta', 'Negociação', 'Cliente', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Oi {nome_empresa}! 💇‍♀️\n\nEncontrei o salão de vocês e vi as avaliações. Trabalho com salões em agendamento online e lembrete automático.\n\nVocês ainda marcam tudo no WhatsApp na mão? Consigo automatizar isso.',
      followup_1: 'Oi {nome_empresa}! 👋 Voltei pra saber se você chegou a ver minha mensagem.\n\nSei que a rotina do salão é corrida! O que eu faço é agendamento com lembrete automático, que ajuda com quem esquece o horário.\n\nQuer ver um exemplo?',
      followup_2: '{nome_empresa}, última mensagem 💅\n\nSe não for a hora, tudo bem mesmo. Mas se furo na agenda incomoda aí, me chama que eu te mostro como resolvo.\n\nSucesso!',
      reactivation: 'Oi {nome_empresa}! Tudo bem? 😊\n\nFaz um tempo desde o nosso contato. Como está a agenda do salão?\n\nAinda faz sentido conversarmos, ou prefere que eu não insista?',
    },
    agentPersonality: {
      name: 'Camila',
      tone: 'amigavel',
      knowledge_base: 'Especialista em tecnologia para salões de beleza. Ofereço agendamento online, lembretes automáticos, redução de furos, gestão de clientes e marketing para beleza.',
      services: ['Agendamento online', 'Lembretes automáticos', 'Gestão de clientes', 'Marketing beauty', 'Fidelização'],
    },
    bestHours: { start: 9, end: 19 },
    weeklyLeadTarget: 40,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'pode', 'adorei', 'top', 'vamos'],
      price: ['quanto custa', 'valor', 'preço', 'mensalidade'],
      schedule: ['agendar', 'reunião', 'call', 'visita', 'apresentação'],
      negative: ['não quero', 'para', 'chega', 'stop', 'sair'],
    },
  },
  advocacia: {
    id: 'advocacia',
    label: 'Escritórios de Advocacia',
    emoji: '⚖️',
    defaultLocations: ['São Paulo, SP', 'Campinas, SP', 'Ribeirão Preto, SP'],
    funnelStages: ['Primeiro contato', 'Qualificado', 'Reunião agendada', 'Proposta', 'Contrato', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Olá! Vi o escritório {nome_empresa} e a área de atuação de vocês.\n\nTrabalho com escritórios de advocacia em captação pelo digital e triagem inicial, dentro do que o Código de Ética da OAB permite.\n\nComo chegam os clientes de vocês hoje — indicação, digital, os dois?',
      followup_1: 'Olá {nome_empresa}! Retorno para saber se recebeu minha mensagem anterior.\n\nEntendo que a agenda jurídica é intensa. O que eu faço é específico para advocacia e respeita as regras de publicidade da OAB.\n\nPoderia reservar 15 minutos para eu apresentar?',
      followup_2: '{nome_empresa}, última tentativa de contato.\n\nSe não houver interesse, encerro por aqui sem problema. Se preferir, me diga o que hoje mais limita a captação de vocês e eu digo com franqueza se consigo ajudar.\n\nÀ disposição.',
      reactivation: 'Prezado(a) {nome_empresa},\n\nRetomo o contato após algum tempo. Como está a captação de clientes do escritório atualmente?\n\nAinda faz sentido conversarmos?',
    },
    agentPersonality: {
      name: 'Dra. Juliana',
      tone: 'formal',
      knowledge_base: 'Especialista em marketing digital ético para escritórios de advocacia. Respeitamos as normas do CFE. Ofereço captação de clientes qualificados, triagem automatizada, presença digital e gestão de relacionamento com clientes.',
      services: ['Captação digital ética', 'Triagem de clientes', 'Site jurídico', 'Gestão de clientes', 'Automação de atendimento'],
    },
    bestHours: { start: 9, end: 18 },
    weeklyLeadTarget: 20,
    intentKeywords: {
      positive: ['interesse', 'sim', 'pode', 'quero', 'gostaria', 'vamos', 'quando'],
      price: ['quanto custa', 'valor', 'honorários', 'investimento', 'proposta'],
      schedule: ['agendar', 'reunião', 'visita', 'apresentação', 'call'],
      negative: ['não tenho interesse', 'não quero', 'para', 'stop', 'sair'],
    },
  },
  imoveis: {
    id: 'imoveis',
    label: 'Imobiliárias',
    emoji: '🏠',
    defaultLocations: ['São Paulo, SP', 'Alphaville, SP', 'Barueri, SP'],
    funnelStages: ['Primeiro contato', 'Qualificado', 'Visita agendada', 'Proposta', 'Contrato', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Olá! Vi a {nome_empresa} e dei uma olhada no portfólio de vocês 🏠\n\nTrabalho com imobiliárias em captação e qualificação de lead pelo WhatsApp, antes de chegar no corretor.\n\nHoje quem faz esse primeiro atendimento aí?',
      followup_1: 'Oi {nome_empresa}! 👋 Sei que o mercado imobiliário está movimentado.\n\nRetomo o contato — o que eu faço é qualificar o lead antes de ele chegar ao corretor, pra ninguém gastar tempo com curioso.\n\nVale uma conversa rápida?',
      followup_2: '{nome_empresa}, última tentativa 🏡\n\nSe não for o momento, sem problema. Se lead frio for um incômodo aí, me chama que eu explico como filtro isso.\n\nSucesso nas vendas!',
      reactivation: 'Olá {nome_empresa}! Tudo bem? 😊\n\nFaz um tempo desde o nosso contato. Como está o movimento de vocês agora?\n\nAinda faz sentido a gente retomar?',
    },
    agentPersonality: {
      name: 'Ricardo',
      tone: 'consultivo',
      knowledge_base: 'Especialista em marketing digital imobiliário. Ofereço captação de leads qualificados, automação de atendimento, integração com portais imobiliários e gestão de relacionamento com compradores e locatários.',
      services: ['Captação de leads', 'Qualificação automática', 'Integração com portais', 'Marketing imobiliário', 'CRM para corretores'],
    },
    bestHours: { start: 9, end: 18 },
    weeklyLeadTarget: 60,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'pode', 'vamos', 'quando', 'visitar', 'ver o imóvel'],
      price: ['quanto custa', 'valor', 'preço', 'comissão', 'investimento'],
      schedule: ['agendar', 'visita', 'reunião', 'ver o imóvel', 'quando posso'],
      negative: ['não quero', 'não tenho interesse', 'para', 'stop', 'sair'],
    },
  },
  contabilidade: {
    id: 'contabilidade',
    label: 'Escritórios de Contabilidade',
    emoji: '📊',
    defaultLocations: ['São Paulo, SP', 'Santo André, SP', 'São Bernardo do Campo, SP'],
    funnelStages: ['Contato', 'Qualificado', 'Proposta', 'Negociação', 'Cliente', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Olá! Vi o escritório {nome_empresa} e a especialização de vocês.\n\nTrabalho com contadores em captação: empresas que precisam trocar de contador ou abrir CNPJ.\n\nComo chegam os clientes novos de vocês hoje?',
      followup_1: 'Oi {nome_empresa}! 👋 Sei que a temporada fiscal é intensa.\n\nRetorno pra saber se você viu minha mensagem. O que eu faço é captação automatizada, que roda justamente nos períodos em que você não tem tempo pra isso.\n\nVale 10 minutos?',
      followup_2: '{nome_empresa}, última mensagem 📊\n\nEm época de obrigação acessória, sei que comercial fica em último lugar. Se fizer sentido retomar depois, é só me chamar.\n\nÀ disposição!',
      reactivation: 'Olá {nome_empresa}! Tudo bem? 😊\n\nFaz um tempo desde o nosso contato. Como está a carteira de clientes de vocês agora?\n\nAinda faz sentido conversarmos?',
    },
    agentPersonality: {
      name: 'Marcos',
      tone: 'profissional',
      knowledge_base: 'Especialista em marketing para escritórios contábeis. Ofereço captação de clientes pessoa jurídica, automação de atendimento inicial, abertura de CNPJ como isca de lead, e gestão de relacionamento com clientes contábeis.',
      services: ['Captação de clientes PJ', 'Abertura de CNPJ', 'Automação de atendimento', 'Marketing contábil', 'Gestão de clientes'],
    },
    bestHours: { start: 8, end: 17 },
    weeklyLeadTarget: 30,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'pode', 'vamos', 'quando', 'gostaria'],
      price: ['quanto custa', 'valor', 'mensalidade', 'honorários', 'proposta'],
      schedule: ['agendar', 'reunião', 'call', 'apresentação', 'visita'],
      negative: ['não quero', 'não tenho interesse', 'para', 'stop', 'sair'],
    },
  },
  ecommerce: {
    id: 'ecommerce',
    label: 'E-commerce e Lojas Online',
    emoji: '🛒',
    defaultLocations: ['São Paulo, SP', 'Barueri, SP', 'Cotia, SP'],
    funnelStages: ['Contato', 'Qualificado', 'Demo', 'Proposta', 'Cliente', 'Não converteu'],
    messageTemplates: {
      first_contact: 'Olá! Vi a loja {nome_empresa} 🛒\n\nTrabalho com lojas online em recuperação de carrinho e recompra por WhatsApp, sem precisar de desenvolvedor.\n\nVocês fazem alguma recuperação de carrinho hoje?',
      followup_1: 'Oi {nome_empresa}! 👋 Retorno para saber se você chegou a ver minha mensagem.\n\nA recuperação de carrinho que eu faço funciona com Shopify, Nuvemshop e WooCommerce.\n\nVale uma conversa?',
      followup_2: '{nome_empresa}, última tentativa 🚀\n\nSe não for o momento, tudo certo. Se carrinho abandonado for uma dor aí, me chama que eu te explico como ataco isso.\n\nBoas vendas!',
      reactivation: 'Oi {nome_empresa}! Tudo bem? 😊\n\nFaz um tempo desde o nosso contato. Como andam as vendas da loja?\n\nAinda faz sentido a gente retomar?',
    },
    agentPersonality: {
      name: 'Beatriz',
      tone: 'dinamico',
      knowledge_base: 'Especialista em automação para e-commerce. Ofereço recuperação de carrinho abandonado via WhatsApp, pós-venda automatizado, recompra, suporte automatizado e marketing para lojas online.',
      services: ['Recuperação de carrinho', 'Pós-venda automático', 'Recompra', 'Suporte automatizado', 'Marketing e-commerce'],
    },
    bestHours: { start: 9, end: 21 },
    weeklyLeadTarget: 50,
    intentKeywords: {
      positive: ['quero', 'interesse', 'sim', 'top', 'show', 'bora', 'vamos', 'quando'],
      price: ['quanto custa', 'valor', 'plano', 'mensalidade', 'taxa'],
      schedule: ['agendar', 'call', 'demo', 'apresentação', 'reunião'],
      negative: ['não quero', 'para', 'stop', 'sair', 'chega'],
    },
  },
};

export const NICHE_LIST = Object.values(NICHE_CONFIGS);
export const getNicheConfig = (id: string): NicheConfig | null => NICHE_CONFIGS[id] || null;
