-- Drop problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Collaborators can view their assigned benefits" ON public.benefits;

-- Recreate a simpler policy without recursion
-- Users who belong to the company can view benefits (this is enough for collaborators too since they have user_id)
CREATE POLICY "Collaborators can view assigned benefits"
ON public.benefits FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM collaborators c
    WHERE c.company_id = benefits.company_id
    AND c.user_id = auth.uid()
  )
);