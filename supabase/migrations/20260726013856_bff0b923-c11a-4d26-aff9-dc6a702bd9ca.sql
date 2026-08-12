-- ============================================================
-- PLANO VITALÍCIO DA CONTA DONA — SÓ SE ELA EXISTIR AQUI
-- ============================================================
-- Mesma situação da migração que concede o papel de admin: o id veio do banco
-- antigo, e num projeto novo `auth.users` está vazia. A chave estrangeira
-- reprova e a migração derruba as seguintes.
--
-- Vira condicional em vez de sumir, porque o histórico precisa continuar
-- íntegro. Em projeto novo isto não faz nada — e não fazer nada é o certo:
-- herdar a assinatura de um usuário de outro banco seria dar plano
-- enterprise a uma conta que não existe.

DELETE FROM public.subscriptions
WHERE user_id = '4ab898dc-d738-4e01-ab2d-48e7554af43d';

INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
SELECT
  '4ab898dc-d738-4e01-ab2d-48e7554af43d'::uuid,
  'enterprise',
  'active',
  NOW(),
  NOW() + INTERVAL '100 years'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '4ab898dc-d738-4e01-ab2d-48e7554af43d'
);
