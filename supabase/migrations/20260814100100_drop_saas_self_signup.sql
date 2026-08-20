-- Remove o auto-cadastro de empresa herdado do fork SaaS (kiingor/meurh).
--
-- Cadeia de escalada que isso fecha:
--   1. `"Users can insert their own company"` tem WITH CHECK (auth.uid() = owner_id)
--      — qualquer usuário autenticado criava uma company com ele mesmo de owner;
--   2. o trigger `trg_companies_owner_admin_role` então inseria em user_roles o
--      papel 'admin' pro owner. Como user_roles NÃO tem company_id, esse papel é
--      GLOBAL: o usuário passava a ser admin de todo o sistema.
--
-- Hoje o passo 2 falha por acidente (o enum app_role foi renomeado e 'admin'
-- deixou de existir), não por controle. Se alguém reintroduzir o valor no enum,
-- a escalada volta sozinha.
--
-- DNA Softcom é single-tenant: filial nova entra por migration ou service_role,
-- nunca pelo client. admin_gc mantém acesso total via a policy FOR ALL criada em
-- 20260430160000_admin_gc_legacy_table_access.sql (companies está na lista).
--
-- A policy de UPDATE é preservada de propósito: ConfiguracoesPage.tsx:133 grava
-- logo_url com o client do usuário e depende dela.

BEGIN;

DROP POLICY IF EXISTS "Users can insert their own company" ON public.companies;

DROP TRIGGER IF EXISTS trg_companies_owner_admin_role ON public.companies;
DROP FUNCTION IF EXISTS public.ensure_company_owner_admin_role();

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
--
-- CREATE POLICY "Users can insert their own company"
-- ON public.companies
-- FOR INSERT
-- WITH CHECK (auth.uid() = owner_id);
--
-- CREATE OR REPLACE FUNCTION public.ensure_company_owner_admin_role()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $fn$
-- BEGIN
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES (NEW.owner_id, 'admin'::app_role)
--   ON CONFLICT (user_id, role) DO NOTHING;
--   RETURN NEW;
-- END;
-- $fn$;
--
-- CREATE TRIGGER trg_companies_owner_admin_role
-- AFTER INSERT ON public.companies
-- FOR EACH ROW
-- EXECUTE FUNCTION public.ensure_company_owner_admin_role();
--
-- COMMIT;
