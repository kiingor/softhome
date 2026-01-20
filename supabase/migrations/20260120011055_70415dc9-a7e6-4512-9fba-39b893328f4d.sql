-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'rh', 'gestor', 'contador', 'colaborador');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create stores table for multi-store support
CREATE TABLE public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    store_code TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Add store_id to profiles for store-level access
ALTER TABLE public.profiles ADD COLUMN store_id UUID REFERENCES public.stores(id);

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS SETOF app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;

-- Create function to check if user belongs to company
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND company_id = _company_id
  )
$$;

-- RLS Policies for user_roles
-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Only admins can manage roles (using security definer function)
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for stores
-- Users can view stores from their company
CREATE POLICY "Users can view company stores"
ON public.stores
FOR SELECT
USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Only admins can manage stores
CREATE POLICY "Admins can insert stores"
ON public.stores
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') 
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can update stores"
ON public.stores
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') 
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

CREATE POLICY "Admins can delete stores"
ON public.stores
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin') 
  AND public.user_belongs_to_company(auth.uid(), company_id)
);