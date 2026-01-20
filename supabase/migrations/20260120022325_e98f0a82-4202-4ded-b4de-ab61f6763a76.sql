-- 1) Tornar membership robusto: perfil OU dono da empresa
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.companies
    WHERE id = _company_id
      AND owner_id = _user_id
  )
$function$;

-- 2) Auto-conceder role admin ao dono quando uma company é criada
CREATE OR REPLACE FUNCTION public.ensure_company_owner_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.owner_id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_owner_admin_role ON public.companies;
CREATE TRIGGER trg_companies_owner_admin_role
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.ensure_company_owner_admin_role();