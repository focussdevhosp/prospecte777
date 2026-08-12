-- ============================================================
-- ADMIN DA CONTA DONA — SÓ SE ELA EXISTIR AQUI
-- ============================================================
-- Esta migração dá papel de admin a um usuário específico, pelo id. Era um
-- INSERT direto, e num projeto novo ele quebra: o id veio do banco antigo, e
-- `auth.users` aqui está vazia — a chave estrangeira reprova, a migração
-- falha, e as 37 seguintes não rodam.
--
-- Migração que carrega id de um ambiente não é portátil. Como o histórico
-- precisa continuar íntegro (outras migrações vieram depois desta e contam
-- com o schema que ela pressupõe), o INSERT passa a ser condicional em vez de
-- ser removido.
--
-- Em projeto novo, ninguém vira admin por aqui. Quem cria a primeira conta
-- promove a si mesmo depois — e isso é mais correto que herdar o dono de
-- outro banco.

INSERT INTO public.user_roles (user_id, role)
SELECT '4ab898dc-d738-4e01-ab2d-48e7554af43d'::uuid, 'admin'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '4ab898dc-d738-4e01-ab2d-48e7554af43d'
)
ON CONFLICT (user_id, role) DO NOTHING;
