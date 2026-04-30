-- Migration: 20260430160000_admin_gc_legacy_table_access.sql
-- Description: garante que role admin_gc tenha acesso total nas tabelas
-- legacy que herdaram do meurh (SaaS multi-tenant com roles 'admin'/'rh'/
-- 'gestor').
--
-- Por que:
-- As policies legacy em collaborators/teams/stores/positions/benefits/etc
-- exigem `user_belongs_to_company(uid, company_id)` — mas admin_gc no
-- modelo SoftHouse é cross-company (admin G&C global, não fica preso a
-- um CNPJ). Resultado: admin_gc não conseguia inserir colaborador.
--
-- Aditivo: cria policies novas FOR ALL com is_admin_gc(uid). Não dropa
-- nada. Como Postgres OR-combina policies, o admin_gc passa via essa
-- nova; gestor_gc continua passando pelas legacy.
--
-- Idempotente: DROP POLICY IF EXISTS antes de CREATE; loop só roda em
-- tabelas que existem.

BEGIN;

-- ============================================================
-- Helper: is_admin_gc
-- Não depende do enum app_role pra evitar quebra em renames futuros.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_gc(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'admin_gc'
  )
$$;

COMMENT ON FUNCTION public.is_admin_gc(uuid) IS
  'True se o user tem role admin_gc. Usar em policies pra bypass de checks de company_id.';

-- ============================================================
-- Loop: aplica policy "admin_gc full access" em cada tabela legacy
-- ============================================================
DO $$
DECLARE
  t text;
  policy_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- core legacy
    'collaborators',
    'teams',
    'stores',
    'positions',
    'benefits',
    'benefits_assignments',
    'companies',
    'profiles',
    'user_roles',
    -- payroll legacy
    'payroll_entries',
    'closed_periods',
    'payslips',
    -- outras tabelas que possam ter policies legacy
    'departments',
    'roles_log',
    'system_settings'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = t
    ) THEN
      policy_name := 'admin_gc full access ' || t;

      EXECUTE format(
        'DROP POLICY IF EXISTS %1$I ON public.%2$I',
        policy_name, t
      );

      EXECUTE format(
        'CREATE POLICY %1$I ON public.%2$I '
        'FOR ALL '
        'USING (public.is_admin_gc(auth.uid())) '
        'WITH CHECK (public.is_admin_gc(auth.uid()))',
        policy_name, t
      );

      RAISE NOTICE 'admin_gc policy criada em public.%', t;
    ELSE
      RAISE NOTICE 'tabela public.% não existe — skip', t;
    END IF;
  END LOOP;
END$$;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DO $$
--   DECLARE t text;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY[
--       'collaborators','teams','stores','positions','benefits',
--       'benefits_assignments','companies','profiles','user_roles',
--       'payroll_entries','closed_periods','payslips','departments',
--       'roles_log','system_settings'
--     ] LOOP
--       IF EXISTS (SELECT 1 FROM information_schema.tables
--                  WHERE table_schema='public' AND table_name=t) THEN
--         EXECUTE format('DROP POLICY IF EXISTS %1$I ON public.%2$I',
--                        'admin_gc full access ' || t, t);
--       END IF;
--     END LOOP;
--   END$$;
--   DROP FUNCTION IF EXISTS public.is_admin_gc(uuid);
-- COMMIT;
