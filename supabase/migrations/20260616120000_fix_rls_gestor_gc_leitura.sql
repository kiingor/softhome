-- Fix de RLS: gestor_gc (e rh/contador) não conseguiam LER dados apesar de
-- terem permissão marcada. Dois bugs distintos, ambos pré-existentes que só
-- apareceram quando o primeiro gestor_gc real foi configurado:
--
-- Bug A — collaborators perdeu a policy de SELECT por permissão. Sobraram só
--   "admin_gc full access" e "ver o próprio registro". Nenhuma consultava
--   can_view_module('colaboradores'), então a lista vinha vazia.
--
-- Bug B — dezenas de policies de gestor_gc/rh/contador (folha, 13º,
--   recrutamento, admissão, jornada, audit, alerts, agent_*) chamam
--   user_belongs_to_company(company_id, auth.uid()) — argumentos INVERTIDOS
--   (a assinatura é (_user_id, _company_id)), retornando sempre falso.
--   Em vez de reescrever ~36 policies (alto risco), tornamos a função
--   tolerante à ordem: um par (user_id, company_id) é direcionalmente
--   inequívoco — nenhum uuid é usuário e empresa ao mesmo tempo — então
--   checar as duas direções é seguro e não altera os callers corretos.
--   (Os callers com args trocados ficam como dívida técnica pra limpar.)

-- === Bug B: função order-tolerant ===
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE (user_id = _user_id AND company_id = _company_id)
       OR (user_id = _company_id AND company_id = _user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.companies
    WHERE (id = _company_id AND owner_id = _user_id)
       OR (id = _user_id AND owner_id = _company_id)
  )
$function$;

-- === Bug A: SELECT por permissão em collaborators ===
DROP POLICY IF EXISTS "Users with permission can view collaborators" ON public.collaborators;
CREATE POLICY "Users with permission can view collaborators"
ON public.collaborators FOR SELECT
TO authenticated
USING (public.can_view_module(auth.uid(), company_id, 'colaboradores'));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP POLICY IF EXISTS "Users with permission can view collaborators" ON public.collaborators;
--
-- CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
-- RETURNS boolean
-- LANGUAGE sql
-- STABLE SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
--   SELECT EXISTS (
--     SELECT 1 FROM public.profiles
--     WHERE user_id = _user_id AND company_id = _company_id
--   )
--   OR EXISTS (
--     SELECT 1 FROM public.companies
--     WHERE id = _company_id AND owner_id = _user_id
--   )
-- $function$;
