-- Add policy for collaborators to view their own payroll entries
CREATE POLICY "Collaborators can view their own payroll entries"
ON public.payroll_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM collaborators c
    WHERE c.id = payroll_entries.collaborator_id
    AND c.user_id = auth.uid()
  )
);