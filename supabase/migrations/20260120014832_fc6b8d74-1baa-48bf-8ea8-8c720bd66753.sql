-- Fix security definer view by dropping and recreating as regular view with RLS check
DROP VIEW IF EXISTS public.companies_overview;

-- Recreate view without security issues - access controlled by master_admins table
CREATE OR REPLACE VIEW public.companies_overview 
WITH (security_invoker = true)
AS
SELECT 
  c.id,
  c.company_name,
  c.plan_type,
  c.subscription_status,
  c.is_blocked,
  c.created_at,
  c.asaas_customer_id,
  c.asaas_subscription_id,
  c.subscription_due_date,
  (SELECT COUNT(*) FROM collaborators col WHERE col.company_id = c.id AND col.status = 'ativo') as active_collaborators
FROM companies c;

-- Fix function search path issues
CREATE OR REPLACE FUNCTION public.get_plan_limit(plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE plan
    WHEN 'essencial' THEN 5
    WHEN 'crescer' THEN 10
    WHEN 'profissional' THEN 30
    WHEN 'empresa_plus' THEN 100
    ELSE 5
  END
$$;

CREATE OR REPLACE FUNCTION public.can_add_collaborator(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM collaborators WHERE company_id = _company_id AND status = 'ativo') 
    < get_plan_limit((SELECT plan_type FROM companies WHERE id = _company_id))
$$;