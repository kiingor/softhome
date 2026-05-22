-- Migration: is_company_admin reconhece role admin_gc
--
-- BUG: Usuário com role admin_gc em user_roles aparecia como "Administrador G&C"
-- no header (correto, lê de user_roles via get_user_roles), mas o sidebar mostrava
-- só "Visão Geral" porque useSidebarPermissions chama is_company_admin(), e a
-- definição original dessa função só checava owner_id da company:
--
--   SELECT EXISTS (SELECT 1 FROM companies WHERE id = _company_id AND owner_id = _user_id)
--
-- Como admin_gc é cross-company por design (G&C global, não fica preso a um CNPJ —
-- ver migration 20260430160000), ele deve contar como admin em qualquer company.
-- Fix: OR is_admin_gc(_user_id).
--
-- Side effect intencional: TODAS as policies/queries que usam is_company_admin agora
-- também passam pra admin_gc — alinhado com a semântica de "G&C admin tem acesso
-- total" já estabelecida pela migration 20260430160000 (que criou policies separadas
-- pra ele em tabelas legacy).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.companies
      WHERE id = _company_id
        AND owner_id = _user_id
    )
    OR public.is_admin_gc(_user_id);
$$;

COMMENT ON FUNCTION public.is_company_admin(uuid, uuid) IS
  'True se o user é owner da company OU tem role admin_gc (G&C admin global). '
  'Usar em policies e gates de UI pra reconhecer ambos os caminhos de admin.';

COMMIT;

-- ROLLBACK
-- BEGIN;
--   CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
--   RETURNS boolean
--   LANGUAGE sql
--   STABLE
--   SECURITY DEFINER
--   SET search_path = public
--   AS $$
--     SELECT EXISTS (
--       SELECT 1 FROM public.companies
--       WHERE id = _company_id AND owner_id = _user_id
--     );
--   $$;
-- COMMIT;
