-- Create system messages table for notifications to clients
CREATE TABLE IF NOT EXISTS public.system_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'info', -- info, warning, alert
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  visible_until TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Company owners can view their messages
CREATE POLICY "Company users can view their messages"
ON public.system_messages
FOR SELECT
USING (
  company_id IS NULL OR 
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = system_messages.company_id
  )
);

-- Policy: Company users can mark messages as read
CREATE POLICY "Company users can update their messages"
ON public.system_messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = system_messages.company_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = system_messages.company_id
  )
);

-- Policy: Master admins can manage all messages
CREATE POLICY "Master admins can manage all messages"
ON public.system_messages
FOR ALL
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_system_messages_company ON public.system_messages(company_id);
CREATE INDEX idx_system_messages_visible ON public.system_messages(visible_until) WHERE visible_until IS NOT NULL;

-- Add email column to master_admins if not exists (for authorized emails check)
ALTER TABLE public.master_admins DROP CONSTRAINT IF EXISTS master_admins_user_id_key;

-- Allow master admins to view all companies for the overview
CREATE POLICY "Master admins can view all companies"
ON public.companies
FOR SELECT
USING (is_master_admin(auth.uid()));

-- Allow master admins to update companies
CREATE POLICY "Master admins can update companies"
ON public.companies
FOR UPDATE
USING (is_master_admin(auth.uid()));

-- Allow master admins to view all collaborators
CREATE POLICY "Master admins can view all collaborators"
ON public.collaborators
FOR SELECT
USING (is_master_admin(auth.uid()));

-- Allow master admins to view all profiles
CREATE POLICY "Master admins can view all profiles"
ON public.profiles
FOR SELECT
USING (is_master_admin(auth.uid()));