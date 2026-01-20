-- Add subscription fields to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_due_date DATE,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- Create enum for plan types
DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM ('essencial', 'crescer', 'profissional', 'empresa_plus');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Update plan_type column to use proper values (keeping as text for compatibility)
-- Default new signups to 'essencial'
ALTER TABLE public.companies ALTER COLUMN plan_type SET DEFAULT 'essencial';

-- Create table for subscription history
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  previous_plan TEXT,
  new_plan TEXT NOT NULL,
  changed_by UUID,
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on subscription_history
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

-- Create policies for subscription_history
CREATE POLICY "Company owners can view their subscription history"
ON public.subscription_history
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = subscription_history.company_id 
  AND c.owner_id = auth.uid()
));

-- Create master_admins table for Portal Master access
CREATE TABLE IF NOT EXISTS public.master_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on master_admins
ALTER TABLE public.master_admins ENABLE ROW LEVEL SECURITY;

-- Policy: Master admins can view themselves
CREATE POLICY "Master admins can view themselves"
ON public.master_admins
FOR SELECT
USING (auth.uid() = user_id);

-- Create view for company subscription overview (for Portal Master)
CREATE OR REPLACE VIEW public.companies_overview AS
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

-- Function to check if user is master admin
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.master_admins WHERE user_id = _user_id
  )
$$;

-- Function to get collaborator limit by plan
CREATE OR REPLACE FUNCTION public.get_plan_limit(plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE plan
    WHEN 'essencial' THEN 5
    WHEN 'crescer' THEN 10
    WHEN 'profissional' THEN 30
    WHEN 'empresa_plus' THEN 100
    ELSE 5
  END
$$;

-- Function to check if company can add more collaborators
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