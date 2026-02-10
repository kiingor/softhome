
-- 1. ALTER TABLE positions: add risk_group and exam_periodicity_months
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS risk_group text,
  ADD COLUMN IF NOT EXISTS exam_periodicity_months integer;

-- 2. CREATE TABLE occupational_exams
CREATE TABLE public.occupational_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id),
  exam_type text NOT NULL, -- admissional, periodico, mudanca_funcao, retorno_trabalho, demissional, avulso
  status text NOT NULL DEFAULT 'pendente', -- pendente, agendado, realizado, vencido, cancelado
  due_date date NOT NULL,
  scheduled_date date,
  completed_date date,
  risk_group_at_time text,
  notes text,
  created_by uuid,
  auto_generated boolean NOT NULL DEFAULT false,
  previous_position_id uuid REFERENCES public.positions(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.occupational_exams ENABLE ROW LEVEL SECURITY;

-- RLS policies for occupational_exams
CREATE POLICY "Users with permission can view exams"
  ON public.occupational_exams FOR SELECT
  USING (
    can_view_module(auth.uid(), company_id, 'exames'::text)
    OR EXISTS (
      SELECT 1 FROM collaborators c
      WHERE c.id = occupational_exams.collaborator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users with permission can insert exams"
  ON public.occupational_exams FOR INSERT
  WITH CHECK (has_module_permission(auth.uid(), company_id, 'exames'::text, 'can_create'::text));

CREATE POLICY "Users with permission can update exams"
  ON public.occupational_exams FOR UPDATE
  USING (has_module_permission(auth.uid(), company_id, 'exames'::text, 'can_edit'::text));

CREATE POLICY "Users with permission can delete exams"
  ON public.occupational_exams FOR DELETE
  USING (has_module_permission(auth.uid(), company_id, 'exames'::text, 'can_delete'::text));

-- Trigger for updated_at
CREATE TRIGGER update_occupational_exams_updated_at
  BEFORE UPDATE ON public.occupational_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. CREATE TABLE exam_documents (no DELETE policy - versioning only)
CREATE TABLE public.exam_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.occupational_exams(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for exam_documents (no DELETE)
CREATE POLICY "Users with permission can view exam documents"
  ON public.exam_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM occupational_exams e
      WHERE e.id = exam_documents.exam_id
        AND (
          can_view_module(auth.uid(), e.company_id, 'exames'::text)
          OR EXISTS (
            SELECT 1 FROM collaborators c
            WHERE c.id = e.collaborator_id AND c.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Users with permission can insert exam documents"
  ON public.exam_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM occupational_exams e
      WHERE e.id = exam_documents.exam_id
        AND has_module_permission(auth.uid(), e.company_id, 'exames'::text, 'can_create'::text)
    )
  );

-- 4. Storage bucket for exam documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-documents', 'exam-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload exam documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exam-documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view exam documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-documents' AND auth.role() = 'authenticated');

-- 5. Trigger: auto-create admission exam when collaborator is created with position
CREATE OR REPLACE FUNCTION public.auto_create_admission_exam()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _risk_group text;
BEGIN
  -- Only on INSERT when position_id is set
  IF TG_OP = 'INSERT' AND NEW.position_id IS NOT NULL THEN
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
$function$;

CREATE TRIGGER trg_auto_create_admission_exam
  AFTER INSERT ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_admission_exam();

-- 6. Function to generate next periodic exam when one is completed
CREATE OR REPLACE FUNCTION public.generate_next_periodic_exam()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _periodicity integer;
  _risk_group text;
  _position_id uuid;
BEGIN
  -- Only when status changes to 'realizado' and it's a periodic or admissional exam
  IF NEW.status = 'realizado' AND (OLD.status IS NULL OR OLD.status != 'realizado')
     AND NEW.exam_type IN ('admissional', 'periodico') THEN
    
    -- Get collaborator's current position info
    SELECT c.position_id INTO _position_id
    FROM collaborators c WHERE c.id = NEW.collaborator_id;
    
    IF _position_id IS NOT NULL THEN
      SELECT p.exam_periodicity_months, p.risk_group
      INTO _periodicity, _risk_group
      FROM positions p WHERE p.id = _position_id;
      
      IF _periodicity IS NOT NULL AND _periodicity > 0 THEN
        INSERT INTO occupational_exams (
          collaborator_id, company_id, position_id, exam_type, status,
          due_date, risk_group_at_time, auto_generated
        ) VALUES (
          NEW.collaborator_id, NEW.company_id, _position_id, 'periodico', 'pendente',
          COALESCE(NEW.completed_date, CURRENT_DATE) + (_periodicity || ' months')::interval,
          _risk_group, true
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_generate_next_periodic_exam
  AFTER UPDATE ON public.occupational_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_next_periodic_exam();
