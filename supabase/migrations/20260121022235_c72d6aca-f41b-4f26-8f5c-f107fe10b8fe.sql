-- Create a function to add collaborator role when user_id is linked
-- This uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.add_collaborator_role_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only run when user_id is being set (was null, now has a value)
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    -- Insert the collaborator role if it doesn't exist
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'colaborador')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically add role when collaborator is linked to user
DROP TRIGGER IF EXISTS on_collaborator_user_linked ON public.collaborators;
CREATE TRIGGER on_collaborator_user_linked
  AFTER UPDATE ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.add_collaborator_role_on_link();

-- Also add RLS policy to allow collaborators to view their own data
CREATE POLICY "Collaborators can view their own record"
ON public.collaborators
FOR SELECT
USING (user_id = auth.uid());

-- Allow collaborators to be updated by the user being linked (for first access)
CREATE POLICY "Users can link themselves to collaborator"
ON public.collaborators
FOR UPDATE
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));