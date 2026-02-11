
-- 1. Add new values to collaborator_status enum
ALTER TYPE public.collaborator_status ADD VALUE IF NOT EXISTS 'aguardando_documentacao';
ALTER TYPE public.collaborator_status ADD VALUE IF NOT EXISTS 'validacao_pendente';
ALTER TYPE public.collaborator_status ADD VALUE IF NOT EXISTS 'reprovado';

-- 2. Create position_documents table
CREATE TABLE public.position_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  observation text,
  file_type text NOT NULL DEFAULT 'pdf' CHECK (file_type IN ('pdf', 'image', 'doc')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.position_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company position documents" ON public.position_documents
  FOR SELECT USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users with permission can insert position documents" ON public.position_documents
  FOR INSERT WITH CHECK (has_module_permission(auth.uid(), company_id, 'cargos', 'can_create'));

CREATE POLICY "Users with permission can update position documents" ON public.position_documents
  FOR UPDATE USING (has_module_permission(auth.uid(), company_id, 'cargos', 'can_edit'));

CREATE POLICY "Users with permission can delete position documents" ON public.position_documents
  FOR DELETE USING (has_module_permission(auth.uid(), company_id, 'cargos', 'can_delete'));

-- 3. Create onboarding_sessions table
CREATE TABLE public.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 1,
  data_validated boolean NOT NULL DEFAULT false,
  financial_validated boolean NOT NULL DEFAULT false,
  documents_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: managed via edge functions (service_role), but allow authenticated users to read for validation
CREATE POLICY "Authenticated users can view onboarding sessions for their company" ON public.onboarding_sessions
  FOR SELECT USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company admins can manage onboarding sessions" ON public.onboarding_sessions
  FOR ALL USING (has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_edit'))
  WITH CHECK (has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_edit'));

-- 4. Create onboarding_errors table
CREATE TABLE public.onboarding_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_session_id uuid NOT NULL REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  step integer NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view onboarding errors for their company" ON public.onboarding_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_errors.onboarding_session_id
        AND user_belongs_to_company(auth.uid(), s.company_id)
    )
  );

CREATE POLICY "Company admins can manage onboarding errors" ON public.onboarding_errors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_errors.onboarding_session_id
        AND has_module_permission(auth.uid(), s.company_id, 'colaboradores', 'can_edit')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.onboarding_sessions s
      WHERE s.id = onboarding_errors.onboarding_session_id
        AND has_module_permission(auth.uid(), s.company_id, 'colaboradores', 'can_edit')
    )
  );

-- 5. Create collaborator_documents table
CREATE TABLE public.collaborator_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position_document_id uuid NOT NULL REFERENCES public.position_documents(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collaborator_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company collaborator documents" ON public.collaborator_documents
  FOR SELECT USING (user_belongs_to_company(auth.uid(), company_id) OR EXISTS (
    SELECT 1 FROM collaborators c WHERE c.id = collaborator_documents.collaborator_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Users with permission can manage collaborator documents" ON public.collaborator_documents
  FOR ALL USING (has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_edit'))
  WITH CHECK (has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_edit'));

-- 6. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('collaborator-documents', 'collaborator-documents', false);

CREATE POLICY "Authenticated users can view collaborator documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'collaborator-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can upload collaborator documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'collaborator-documents');

CREATE POLICY "Service role can update collaborator documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'collaborator-documents');

CREATE POLICY "Service role can delete collaborator documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'collaborator-documents');

-- 7. Update triggers to only fire for 'ativo' status

-- Update auto_create_admission_exam to check status
CREATE OR REPLACE FUNCTION public.auto_create_admission_exam()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _risk_group text;
BEGIN
  -- Only on INSERT when position_id is set AND status is 'ativo'
  IF TG_OP = 'INSERT' AND NEW.position_id IS NOT NULL AND NEW.status = 'ativo' THEN
    SELECT risk_group INTO _risk_group
    FROM positions WHERE id = NEW.position_id;

    INSERT INTO occupational_exams (
      collaborator_id, company_id, position_id, exam_type, status,
      due_date, risk_group_at_time, auto_generated
    ) VALUES (
      NEW.id, NEW.company_id, NEW.position_id, 'admissional', 'pendente',
      CURRENT_DATE + INTERVAL '15 days', _risk_group, true
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Update auto_generate_vacation_periods to check status
CREATE OR REPLACE FUNCTION public.auto_generate_vacation_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only generate vacation periods for active collaborators
  IF NEW.status = 'ativo' AND NEW.admission_date IS NOT NULL AND (OLD.admission_date IS NULL OR OLD.admission_date != NEW.admission_date OR OLD.status != 'ativo') THEN
    DELETE FROM vacation_periods WHERE collaborator_id = NEW.id;
    PERFORM generate_vacation_periods(NEW.id, NEW.company_id, NEW.admission_date);
  END IF;
  RETURN NEW;
END;
$$;
