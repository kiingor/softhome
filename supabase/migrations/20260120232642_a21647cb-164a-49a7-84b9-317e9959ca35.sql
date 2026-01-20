-- Add trial_ends_at column to companies
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 days');

-- Create table for company users (invited users)
CREATE TABLE IF NOT EXISTS public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, email)
);

-- Enable RLS on company_users
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

-- Policies for company_users
CREATE POLICY "Company owners can manage company users"
ON company_users FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM companies 
    WHERE id = company_id AND owner_id = auth.uid()
  )
);

CREATE POLICY "Users can view their own company membership"
ON company_users FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Create table for granular permissions
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  module TEXT NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_id, module)
);

-- Enable RLS on user_permissions
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Policies for user_permissions
CREATE POLICY "Company owners can manage permissions"
ON user_permissions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM companies 
    WHERE id = company_id AND owner_id = auth.uid()
  )
);

CREATE POLICY "Users can view their own permissions"
ON user_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Create security definer function to get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(
  _user_id UUID, 
  _company_id UUID, 
  _module TEXT
)
RETURNS TABLE(can_view BOOLEAN, can_create BOOLEAN, can_edit BOOLEAN, can_delete BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Admin (owner) has all permissions - check this first
  SELECT true::boolean, true::boolean, true::boolean, true::boolean
  WHERE EXISTS (
    SELECT 1 FROM companies WHERE id = _company_id AND owner_id = _user_id
  )
  UNION ALL
  -- Specific user permissions
  SELECT up.can_view, up.can_create, up.can_edit, up.can_delete
  FROM user_permissions up
  WHERE up.user_id = _user_id 
    AND up.company_id = _company_id 
    AND up.module = _module
  LIMIT 1;
$$;

-- Create function to check if user is company admin (owner)
CREATE OR REPLACE FUNCTION is_company_admin(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies 
    WHERE id = _company_id AND owner_id = _user_id
  );
$$;