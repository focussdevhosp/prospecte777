
CREATE TABLE public.objection_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  objection_keywords TEXT[] NOT NULL DEFAULT '{}',
  objection_example TEXT NOT NULL,
  response_template TEXT NOT NULL,
  angle TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objection_responses TO authenticated;
GRANT ALL ON public.objection_responses TO service_role;

ALTER TABLE public.objection_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or templates" ON public.objection_responses
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_template = true);
CREATE POLICY "insert own" ON public.objection_responses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own" ON public.objection_responses
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own" ON public.objection_responses
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_objection_responses_updated_at BEFORE UPDATE ON public.objection_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_objection_responses_user ON public.objection_responses(user_id) WHERE is_active = true;
CREATE INDEX idx_objection_responses_template ON public.objection_responses(is_template) WHERE is_template = true;

-- Seed 15 objeções brasileiras mais comuns
INSERT INTO public.objection_responses (user_id, is_template, category, objection_keywords, objection_example, response_template, angle) VALUES
(NULL, true, 'preco', ARRAY['caro','preço alto','muito dinheiro','não tenho dinheiro','sem orçamento'], 'Tá caro demais pra mim', 'Entendo perfeitamente. Deixa eu te fazer uma pergunta: se o investimento se pagasse em 30 dias com 1 cliente novo, ainda seria caro? Porque nossos clientes recuperam o valor em média nas primeiras 2 semanas. Posso te mostrar como?', 'ROI'),
(NULL, true, 'tempo', ARRAY['vou pensar','preciso pensar','me dá um tempo','depois eu vejo'], 'Vou pensar e te retorno', 'Claro, pensar é importante! Só pra eu entender melhor: o que exatamente ficou em dúvida? Preço, resultado ou timing? Assim posso te ajudar a decidir com mais clareza (ou já libero seu tempo se não fizer sentido).', 'clareza'),
(NULL, true, 'email', ARRAY['manda no email','envia por email','me manda material'], 'Manda os detalhes no meu email', 'Posso mandar sim! Mas te confesso: 90% dos materiais por email não são lidos. Que tal 5 minutos de call amanhã pra eu te mostrar direto o que faz sentido pro seu caso? Aí já te mando o resumo depois.', 'engajamento'),
(NULL, true, 'concorrente', ARRAY['já tenho','já uso','trabalho com outro','tenho fornecedor'], 'Já trabalho com outra empresa', 'Que bom que já investe nisso! A maioria dos nossos melhores clientes veio da concorrência. Posso te fazer uma análise gratuita comparando resultados? Sem compromisso, só pra você ter parâmetro.', 'comparacao'),
(NULL, true, 'autoridade', ARRAY['preciso falar com sócio','vou consultar','não sou eu que decido'], 'Preciso falar com meu sócio', 'Perfeito! Que tal marcarmos uma call com vocês dois juntos? Assim eu explico uma única vez e vocês podem decidir na hora, com todas as dúvidas resolvidas. Qual dia funciona pra vocês?', 'facilitar'),
(NULL, true, 'urgencia', ARRAY['agora não','mês que vem','não é prioridade','depois'], 'Agora não é o momento', 'Entendi. Só pra eu não te incomodar à toa: qual seria o momento certo? E o que precisa acontecer até lá pra virar prioridade? Aí eu retomo no timing certo.', 'timing'),
(NULL, true, 'ceticismo', ARRAY['não acredito','duvido','muito bom pra ser verdade','golpe'], 'Isso não funciona / muito bom pra ser verdade', 'Faz total sentido desconfiar! Por isso não te peço pra acreditar em mim. Posso te conectar com 2-3 clientes atuais do seu segmento pra você ouvir direto deles? Assim você tira suas próprias conclusões.', 'prova-social'),
(NULL, true, 'resultado', ARRAY['funciona pra mim','meu nicho é diferente','meu caso é único'], 'Meu nicho é muito específico', 'Ótima observação! Já atendemos [nicho similar] com resultados de X%. Deixa eu te mandar 1 case do seu segmento pra você validar se faz sentido antes de qualquer coisa?', 'especificidade'),
(NULL, true, 'compromisso', ARRAY['contrato longo','fidelidade','preso'], 'Não quero contrato longo', 'Justo. Por isso nosso modelo é mensal, sem multa. Se em 30 dias você não ver resultado, cancela e a gente se despede amigos. Faz sentido testar assim?', 'baixo-risco'),
(NULL, true, 'suporte', ARRAY['e depois','suporte','me deixam sozinho'], 'E depois vocês somem', 'Justo esse receio! Por isso todo cliente tem gerente dedicado no WhatsApp com resposta em <2h. Posso te apresentar quem seria seu ponto de contato antes de fechar?', 'seguranca'),
(NULL, true, 'complexidade', ARRAY['complicado','difícil','não sei mexer','sou leigo'], 'Parece muito complicado pra mim', 'Boa! 80% dos nossos clientes chegaram achando isso. A gente cuida de tudo, você só precisa aprovar as mensagens. Onboarding é 15 minutos. Topa uma demo rápida?', 'facilidade'),
(NULL, true, 'silencio', ARRAY['visto','ok','entendi','tá'], 'Cliente parou de responder (visto sem resposta)', 'Oi [nome], notei que sumiu por aqui rs. Sem pressão, mas quero entender: o que faltou pra fazer sentido? Feedback sincero me ajuda demais (mesmo que seja "não").', 'quebra-gelo'),
(NULL, true, 'reuniao', ARRAY['sem tempo','agenda cheia','muito ocupado'], 'Não tenho tempo pra reunião', 'Entendo, corrido mesmo. Posso te mandar um Loom de 3 minutos com tudo? Assim você vê quando quiser e me responde só se fizer sentido.', 'assíncrono'),
(NULL, true, 'tentou', ARRAY['já tentei','não funcionou','testei antes'], 'Já tentei isso antes e não funcionou', 'Que ruim ouvir isso. Sabe qual costuma ser a diferença entre quem trava e quem escala? [seu diferencial]. Posso te mostrar em 5 min o que provavelmente faltou antes?', 'diagnostico'),
(NULL, true, 'crise', ARRAY['crise','economia','mercado ruim'], 'Com essa economia não dá', 'Justamente por isso! Nossos clientes que mais cresceram foram os que investiram em crise, enquanto os concorrentes recuaram. Posso te mostrar 2 cases de 2024?', 'contra-intuitivo');
