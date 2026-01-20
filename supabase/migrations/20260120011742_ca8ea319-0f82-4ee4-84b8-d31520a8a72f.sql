-- Fix the function search path issue
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create status enum for collaborators (if not exists)
DO $$ BEGIN
  CREATE TYPE public.collaborator_status AS ENUM ('ativo', 'inativo');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create teams table
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Create collaborators table
CREATE TABLE IF NOT EXISTS public.collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cpf TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    position TEXT,
    admission_date DATE,
    birth_date DATE,
    status collaborator_status NOT NULL DEFAULT 'ativo',
    is_temp BOOLEAN NOT NULL DEFAULT false,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint
ALTER TABLE public.collaborators DROP CONSTRAINT IF EXISTS collaborators_cpf_company_id_key;
ALTER TABLE public.collaborators ADD CONSTRAINT collaborators_cpf_company_id_key UNIQUE (cpf, company_id);

-- Enable RLS on collaborators
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view company teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can insert teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can update teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can delete teams" ON public.teams;

DROP POLICY IF EXISTS "Admin and RH can view all collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Gestor can view store collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admin and RH can insert collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Gestor can insert store collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admin and RH can update collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Gestor can update store collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admin and RH can delete collaborators" ON public.collaborators;

-- RLS Policies for teams
CREATE POLICY "Users can view company teams"
ON public.teams FOR SELECT
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Admin and RH can insert teams"
ON public.teams FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can update teams"
ON public.teams FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can delete teams"
ON public.teams FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- RLS Policies for collaborators
CREATE POLICY "Admin and RH can view all collaborators"
ON public.collaborators FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Gestor can view store collaborators"
ON public.collaborators FOR SELECT
USING (
  public.has_role(auth.uid(), 'gestor')
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can insert collaborators"
ON public.collaborators FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Gestor can insert store collaborators"
ON public.collaborators FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'gestor')
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can update collaborators"
ON public.collaborators FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Gestor can update store collaborators"
ON public.collaborators FOR UPDATE
USING (
  public.has_role(auth.uid(), 'gestor')
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admin and RH can delete collaborators"
ON public.collaborators FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- Create trigger for updated_at on collaborators
DROP TRIGGER IF EXISTS update_collaborators_updated_at ON public.collaborators;
CREATE TRIGGER update_collaborators_updated_at
BEFORE UPDATE ON public.collaborators
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();