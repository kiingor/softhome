-- Add policy for collaborators to view benefits that are assigned to them
CREATE POLICY "Collaborators can view their assigned benefits"
ON public.benefits
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM benefits_assignments ba
    JOIN collaborators c ON c.id = ba.collaborator_id
    WHERE ba.benefit_id = benefits.id
    AND c.user_id = auth.uid()
  )
);