-- profiles perdeu as policies de SELECT: sobrou só "admin_gc full access"
-- (ALL) + INSERT/UPDATE do próprio registro. Resultado: usuário não-admin_gc
-- (gestor_gc, rh, contador) NÃO consegue ler o próprio profile.
--
-- Sintomas: edge functions analyst-chat e recruiter-search liam profiles com
-- o client do usuário (RLS) e devolviam "Usuário sem company_id no profile";
-- no front, loadUserData não lia o profile (caía no fallback de company_users).
--
-- Restaura as duas policies de leitura que existiam na migration original
-- (20260122024828): própria + membros da mesma empresa. SELECT aditivo, seguro.

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Company users can view company profiles" ON public.profiles;
CREATE POLICY "Company users can view company profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.user_belongs_to_company(auth.uid(), company_id));

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
-- DROP POLICY IF EXISTS "Company users can view company profiles" ON public.profiles;
