-- Migration: 20260427150100_create_recruitment_schema.sql
-- Description: schema da Fase 3 (Recrutamento e Seleção). Vagas,
-- candidatos, kanban de aplicações, entrevistas.

BEGIN;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.job_opening_status AS ENUM (
  'draft', 'open', 'paused', 'filled', 'cancelled'
);

CREATE TYPE public.application_stage AS ENUM (
  'new',                    -- inscrito
  'screening',              -- triagem (IA + RH)
  'interview_hr',           -- entrevista RH
  'interview_manager',      -- entrevista gestor
  'offer',                  -- proposta
  'accepted',               -- aceito (handoff pra Admission)
  'rejected',               -- rejeitado
  'withdrawn'               -- candidato desistiu
);

-- ============================================================
-- candidates (banco de talentos, independente de vaga)
-- ============================================================
CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  phone text,
  cpf text,
  cv_url text,                              -- caminho no Storage
  cv_filename text,
  linkedin_url text,
  source text,                              -- 'linkedin' | 'site' | 'indicacao' | etc.
  notes text,
  is_active boolean NOT NULL DEFAULT true,  -- false = pediu pra sair do banco
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)                -- evita duplicado por email
);

CREATE INDEX idx_candidates_company ON public.candidates(company_id);
CREATE INDEX idx_candidates_active ON public.candidates(company_id) WHERE is_active = true;

CREATE TRIGGER set_updated_at_candidates
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_candidates
  AFTER INSERT OR UPDATE OR DELETE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- job_openings
-- ============================================================
CREATE TABLE public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  requirements text,                        -- markdown
  regime public.collaborator_regime NOT NULL,
  status public.job_opening_status NOT NULL DEFAULT 'draft',
  hiring_manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz,
  closed_at timestamptz,
  vacancies_count integer NOT NULL DEFAULT 1 CHECK (vacancies_count >= 1),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_company ON public.job_openings(company_id);
CREATE INDEX idx_jobs_status ON public.job_openings(company_id, status);

CREATE TRIGGER set_updated_at_jobs
  BEFORE UPDATE ON public.job_openings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- candidate_applications (candidato↔vaga, posição no kanban)
-- ============================================================
CREATE TABLE public.candidate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  stage public.application_stage NOT NULL DEFAULT 'new',
  ai_score numeric(5,2),                    -- 0.00 a 100.00 da triagem IA
  ai_summary text,                          -- justificativa do score
  ai_screened_at timestamptz,
  rejected_reason text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)             -- candidato aplica 1x por vaga
);

CREATE INDEX idx_apps_company ON public.candidate_applications(company_id);
CREATE INDEX idx_apps_job_stage ON public.candidate_applications(job_id, stage);
CREATE INDEX idx_apps_candidate ON public.candidate_applications(candidate_id);

CREATE TRIGGER set_updated_at_apps
  BEFORE UPDATE ON public.candidate_applications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_apps
  AFTER INSERT OR UPDATE OR DELETE ON public.candidate_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- interview_schedules
-- ============================================================
CREATE TABLE public.interview_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES public.candidate_applications(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  location text,                            -- ou link de call
  interviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interviews_application ON public.interview_schedules(application_id);
CREATE INDEX idx_interviews_scheduled ON public.interview_schedules(scheduled_for);

CREATE TRIGGER set_updated_at_interviews
  BEFORE UPDATE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- interview_feedbacks
-- ============================================================
CREATE TABLE public.interview_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  schedule_id uuid NOT NULL REFERENCES public.interview_schedules(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.candidate_applications(id) ON DELETE CASCADE,
  interviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recommendation text NOT NULL CHECK (recommendation IN ('hire', 'no_hire', 'maybe', 'next_round')),
  notes text,                               -- texto livre
  ai_summary text,                          -- resumo gerado por Claude
  scores jsonb,                             -- { tecnico: 4, comportamental: 5, fit: 4 } 1-5
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedbacks_application ON public.interview_feedbacks(application_id);

CREATE TRIGGER set_updated_at_feedbacks
  BEFORE UPDATE ON public.interview_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- RLS — todos seguem mesmo padrão (admin_gc/gestor_gc por company_id)
-- ============================================================
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_feedbacks ENABLE ROW LEVEL SECURITY;

-- Padrão genérico: admin_gc lê/escreve tudo; gestor_gc/rh da empresa lê/escreve da própria
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['candidates', 'job_openings', 'candidate_applications',
                               'interview_schedules', 'interview_feedbacks'])
  LOOP
    EXECUTE format('CREATE POLICY "admin_gc reads all %I" ON public.%I FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
              AND ur.role::text IN (''admin_gc'', ''admin'')))', t, t);
    EXECUTE format('CREATE POLICY "gestor_gc reads own %I" ON public.%I FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
              AND ur.role::text IN (''gestor_gc'', ''rh''))
      AND public.user_belongs_to_company(%I.company_id, auth.uid()))', t, t, t);
    EXECUTE format('CREATE POLICY "admin_gc writes %I" ON public.%I FOR ALL USING (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
              AND ur.role::text IN (''admin_gc'', ''admin'')))', t, t);
    EXECUTE format('CREATE POLICY "gestor_gc writes own %I" ON public.%I FOR ALL USING (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
              AND ur.role::text IN (''gestor_gc'', ''rh''))
      AND public.user_belongs_to_company(%I.company_id, auth.uid()))', t, t, t);
  END LOOP;
END $$;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TABLE IF EXISTS public.interview_feedbacks CASCADE;
--   DROP TABLE IF EXISTS public.interview_schedules CASCADE;
--   DROP TABLE IF EXISTS public.candidate_applications CASCADE;
--   DROP TABLE IF EXISTS public.job_openings CASCADE;
--   DROP TABLE IF EXISTS public.candidates CASCADE;
--   DROP TYPE IF EXISTS public.application_stage;
--   DROP TYPE IF EXISTS public.job_opening_status;
-- COMMIT;
