-- Fix RLS policy: avoid reading auth.users (causes "permission denied for table users")
-- Replace with JWT email claim comparison.

DROP POLICY IF EXISTS "Users can link themselves to collaborator" ON public.collaborators;

CREATE POLICY "Users can link themselves to collaborator"
ON public.collaborators
FOR UPDATE
TO authenticated
USING (
  lower(email) = lower(auth.jwt() ->> 'email')
)
WITH CHECK (
  lower(email) = lower(auth.jwt() ->> 'email')
);
