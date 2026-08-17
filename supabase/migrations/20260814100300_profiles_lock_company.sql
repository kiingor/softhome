-- Tira do cliente a permissão de escrever no próprio `profiles`.
--
-- `profiles.company_id` é a base de `user_belongs_to_company()`, que por sua vez
-- é o predicado de RLS de ~18 tabelas. As policies originais deixavam o próprio
-- usuário fazer INSERT/UPDATE na própria linha sem restringir colunas — ou seja,
-- um `PATCH /rest/v1/profiles {"company_id": "<outro-cnpj>"}` movia o usuário
-- pra outra empresa do grupo e abria a leitura dos dados dela.
--
-- Inócuo enquanto existir um único CNPJ cadastrado; vira alta severidade na
-- primeira filial — que é exatamente o desenho multi-CNPJ do sistema.
--
-- Nada no cliente escreve em profiles (as 4 ocorrências em src/ são SELECT).
-- A criação real acontece em create-collaborator-user, com service_role, que
-- ignora RLS e não precisa de policy.

BEGIN;

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
--
-- CREATE POLICY "Users can insert their own profile"
-- ON public.profiles
-- FOR INSERT
-- WITH CHECK (auth.uid() = user_id);
--
-- CREATE POLICY "Users can update their own profile"
-- ON public.profiles
-- FOR UPDATE
-- USING (auth.uid() = user_id);
--
-- COMMIT;
