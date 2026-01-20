-- 1. Adicionar coluna CNPJ à tabela stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS cnpj TEXT;

-- 2. Criar tabela de cargos
CREATE TABLE IF NOT EXISTS public.positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    salary NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- RLS: Admin e RH podem gerenciar cargos
CREATE POLICY "Admin and RH can manage positions" 
ON public.positions FOR ALL
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
);

-- RLS: Usuários podem visualizar cargos da empresa
CREATE POLICY "Users can view company positions" 
ON public.positions FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- 3. Corrigir políticas RLS de stores (recriar como PERMISSIVE)
DROP POLICY IF EXISTS "Admins can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can update stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view company stores" ON public.stores;

CREATE POLICY "Admins can insert stores" ON public.stores
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can update stores" ON public.stores
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can delete stores" ON public.stores
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Users can view company stores" ON public.stores
FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- 4. Corrigir políticas RLS de teams (recriar como PERMISSIVE)
DROP POLICY IF EXISTS "Admin and RH can insert teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can update teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Users can view company teams" ON public.teams;

CREATE POLICY "Admin and RH can insert teams" ON public.teams
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can update teams" ON public.teams
FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can delete teams" ON public.teams
FOR DELETE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Users can view company teams" ON public.teams
FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- 5. Corrigir políticas RLS de benefits (recriar como PERMISSIVE)
DROP POLICY IF EXISTS "Admin and RH can manage benefits" ON public.benefits;
DROP POLICY IF EXISTS "Users can view company benefits" ON public.benefits;

CREATE POLICY "Admin and RH can manage benefits" ON public.benefits
FOR ALL
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'rh'::app_role))
  AND user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Users can view company benefits" ON public.benefits
FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));