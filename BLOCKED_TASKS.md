# Tarefas bloqueadas

O que não consegui terminar sozinho, por quê, e o que destrava. Ordenado por
quanto atrapalha.

---

## 1. As migrações novas ainda não foram aplicadas

**Bloqueio:** não tenho acesso ao Supabase. Sem access token e sem CLI
autenticada, não consigo aplicar migração.

**Por que atrapalha:** todo o trabalho existe em migração no repositório e em
nenhum banco. Enquanto não subir, as telas novas (Missões, Central de IA,
teste A/B) abrem e falham — as tabelas não existem.

**O que destrava:** *SQL Editor* do projeto `oeztpxyprifabkvysroh` → cole o
`MIGRACOES_NOVAS.sql` inteiro → Run. São 10 migrações, 88 KB, alguns
segundos.

Antes, confirme em *Database → Extensions* que `pgcrypto`, `pg_cron` e
`pg_net` estão ligadas — sem as duas últimas os blocos de agendamento falham
(o resto sobe normal, mas nada roda sozinho).

**Todas as 10 são aditivas:** criam tabela, função, gatilho e coluna. Nenhuma
apaga dado, remove coluna ou altera tipo. Ao final há quatro consultas de
conferência, e a última confirma que a contagem de leads continua a mesma.

> O `SCHEMA_COMPLETO.sql` continua no repositório para subir um banco vazio do
> zero. **Não é o seu caso** — não rode aquele.

---

## 2. Os segredos das edge functions não estão configurados

**Bloqueio:** os valores não passam por mim, e configurá-los exige o painel.

**Por que atrapalha:** sem eles, a esteira roda até a hora de escrever a
mensagem e para. Não é degradação silenciosa — o pipeline recusa enviar
qualquer coisa quando a IA não responde, de propósito —, mas na prática nada
sai.

**O que destrava:** *Project Settings → Edge Functions → Secrets*:

| Segredo | Para quê | Sem ele |
|---|---|---|
| `DEEPSEEK_API_KEY` | modelo principal | nenhuma mensagem é escrita |
| `LOVABLE_API_KEY` | modelo reserva | uma falha do DeepSeek para tudo |
| `EVOLUTION_API_URL` | WhatsApp | nada é enviado |
| `EVOLUTION_API_KEY` | WhatsApp | nada é enviado |
| `HUNTER_API_KEY` | e-mail corporativo | dossiê sem e-mail |
| `FIRECRAWL_API_KEY` | auditoria de site | dossiê sem o gancho mais forte |

Depois: `supabase functions deploy` (todas), e um `UPDATE` em
`private.app_config` só se o project ref mudar de novo.

---

## 3. Nenhum teste roda contra Postgres

**Bloqueio:** não há Postgres nesta máquina e não posso instalar serviço.

**Por que atrapalha:** os dois ciclos entregaram lógica de negócio em SQL —
gatilhos, decisão de conclusão de missão, contadores. Nada disso passa pelo
vitest. A rede de proteção atual é o bloco `DO $$ ... RAISE EXCEPTION` no fim
de cada migração, que falha a própria migração quando o resultado sai errado.
Pega o essencial; não pega regressão futura.

**O que destrava:** `supabase start` (exige Docker) e uma suíte que aplique as
migrações num banco descartável. É a lacuna de qualidade mais séria que
identifiquei — e a única que não consigo contornar com engenho.

---

## 4. `npm run lint` acusa 367 problemas anteriores

**Bloqueio:** nenhum, tecnicamente. Não fiz porque não é o que foi pedido e
mexer em 40 arquivos alheios ao trabalho embaralharia todo diff destes ciclos.

**Por que atrapalha:** com o lint vermelho de origem, ele deixa de servir como
sinal — ninguém repara em erro novo no meio de 367.

**O que destrava:** decidir se vale um commit só de `no-explicit-any` nas edge
functions antigas. Cerca de 340 dos 344 erros são esse. Nenhum ciclo
acrescentou erro novo; a conferência é sempre `eslint` no arquivo tocado,
comparado com o mesmo comando no `git stash`.

---

## 5. ~~Não há tela para retomar lead que esgotou as tentativas~~ — RESOLVIDO

Entregue no ciclo 13: o detalhe da missão tem botão "Tentar enviar de novo"
nos leads que falharam no envio, e só neles — desqualificado, recusado e
opt-out são decisões, não falhas de rede.

---

## 7. O follow-up ainda decide pouco

**Bloqueio:** nenhum; é a próxima fatia grande, não cabia nos ciclos até aqui.

**Por que atrapalha:** hoje o follow-up dispara por tempo. Não decide entre
insistir, esperar, encerrar, transferir para humano ou criar tarefa — que é o
que a especificação pede. Lead que respondeu "esse mês não dá" recebe a mesma
cadência de quem nunca respondeu.

**O que destrava:** usar `lead_memory` (que já guarda `objection` e
`commitment`) e o sentimento da última resposta para escolher a ação, em vez
de só contar dias. A infraestrutura toda já existe.

---

## 8. A landing page afirma "ROI médio de 23x comprovado"

**Bloqueio:** deliberado. Não mexi porque é o seu posicionamento comercial,
não um defeito técnico — a decisão é sua, não minha.

**Por que anoto mesmo assim:** `PremiumPricingCard.tsx` diz *"ROI médio de 23x
comprovado"* e a `Landing.tsx` abre uma seção com *"Resultados comprovados —
dados reais de empresas que substituíram a prospecção manual pela IA"*.

É a mesma categoria de afirmação que passei dez ciclos removendo das mensagens
que o produto manda. Fica estranho o sistema recusar-se a dizer "aumentamos
40%" para um lead e a página de vendas dizer "23x comprovado" — e, se alguém
pedir a fonte, a resposta precisa existir.

**O que fazer:** ou apontar de onde vem o número (quantos clientes, que
período, como foi medido), ou trocar por algo que você consiga sustentar.

---

## 6. Segredos expostos no chat precisam ser rotacionados por você

**Bloqueio:** deliberado. Rotacionar segredo é operação irreversível em
produção, e está na lista do que devo parar antes de fazer.

**O que fazer:** três credenciais foram coladas na nossa conversa e devem ser
tratadas como públicas a partir de agora.

1. **Token do GitHub** (`ghp_...`) — *Settings → Developer settings → Personal
   access tokens → Revoke*. **É o urgente:** dá escrita neste repositório. Uso
   aqui foi sempre transitório (`git -c http.extraheader`), nunca gravado em
   arquivo, nunca no histórico.
2. **`sb_secret_...`** e o **JWT `service_role`** — são do projeto
   `sciphxtbxvbpiypbcxub`, que decidimos não usar. Perderam gravidade: são
   chaves de um banco vazio. Ainda assim, chave colada em chat é chave
   pública — revogue quando puder.

A chave `service_role` **não** está em nenhum arquivo do repositório. O
`client.ts` tem uma checagem que derruba o app na inicialização se alguém
configurar uma chave `service_role` como `VITE_*` — em projeto Vite tudo que
começa com `VITE_` vai no bundle que chega ao navegador de qualquer visitante.
