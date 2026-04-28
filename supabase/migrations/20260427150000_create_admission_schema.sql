-- Migration: 20260427150000_create_admission_schema.sql
-- Description: schema da Fase 2 (Admissão). State machine + docs + timeline.
-- Drafts only — não aplicar sem revisar microcopy/política.

BEGIN;

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.admission_journey_status AS ENUM (
  'created',                  -- jornada criada, candidato ainda não preencheu
  'docs_pending',             -- aguardando candidato enviar docs
  'docs_in_review',           -- docs recebidos, RH revisando (com IA)
  'docs_needs_adjustment',    -- algum doc rejeitado, candidato precisa reenviar
  'docs_approved',            -- todos docs aprovados
  'exam_scheduled',           -- exame ocupacional agendado (CLT/Estagiário)
  'exam_done',                -- exame realizado
  'contract_signed',          -- contrato assinado
  'admitted',                 -- admitido ✓ (vira collaborator de fato)
  'cancelled'                 -- cancelado
);

CREATE TYPE public.admission_document_status AS ENUM (
  'pending',          -- candidato ainda não enviou
  'submitted',        -- candidato enviou, aguarda revisão
  'ai_validating',    -- Edge Function Claude analisando
  'approved',         -- RH aprovou
  'needs_adjustment'  -- RH pediu ajuste
);

CREATE TYPE public.admission_event_kind AS ENUM (
  'created',
  'token_sent',
  'docs_submitted',
  'doc_validated',          -- IA validou
  'doc_approved',           -- humano aprovou
  'doc_rejected',           -- humano rejeitou com motivo
  'exam_scheduled',
  'exam_completed',
  'contract_sent',
  'contract_signed',
  'admitted',
  'cancelled',
  'note'                    -- nota livre do RH
);

-- ============================================================
-- admission_journeys
-- ============================================================
CREATE TABLE public.admission_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  candidate_name text NOT NULL,
  candidate_email text,
  candidate_cpf text,
  candidate_phone text,
  position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  regime public.collaborator_regime NOT NULL,        -- definido na criação
  status public.admission_journey_status NOT NULL DEFAULT 'created',
  access_token text NOT NULL UNIQUE,                  -- token de acesso ao form público
  token_expires_at timestamptz,
  -- Vínculo com collaborator final (preenchido quando virar 'admitted')
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  -- Vínculo com aplicação de vaga (Fase 3) — opcional, FK fraca via uuid
  application_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admission_journeys_company ON public.admission_journeys(company_id);
CREATE INDEX idx_admission_journeys_status ON public.admission_journeys(company_id, status);
CREATE INDEX idx_admission_journeys_token ON public.admission_journeys(access_token);

CREATE TRIGGER set_updated_at_admission_journeys
  BEFORE UPDATE ON public.admission_journeys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_admission_journeys
  AFTER INSERT OR UPDATE OR DELETE ON public.admission_journeys
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- admission_documents
-- ============================================================
CREATE TABLE public.admission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  journey_id uuid NOT NULL REFERENCES public.admission_journeys(id) ON DELETE CASCADE,
  doc_type text NOT NULL,                  -- 'rg' | 'cpf' | 'ctps' | 'comprovante_residencia' | 'foto' | etc.
  required boolean NOT NULL DEFAULT true,
  status public.admission_document_status NOT NULL DEFAULT 'pending',
  file_url text,                            -- caminho no Storage
  file_name text,
  uploaded_at timestamptz,
  ai_validation_result jsonb,               -- output estruturado do Claude
  ai_confidence numeric(4,3),               -- 0.000 a 1.000
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,                    -- preenchido se status = 'needs_adjustment'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admission_docs_journey ON public.admission_documents(journey_id);
CREATE INDEX idx_admission_docs_status ON public.admission_documents(status);

CREATE TRIGGER set_updated_at_admission_documents
  BEFORE UPDATE ON public.admission_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_admission_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.admission_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- admission_events (timeline)
-- ============================================================
CREATE TABLE public.admission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  journey_id uuid NOT NULL REFERENCES public.admission_journeys(id) ON DELETE CASCADE,
  kind public.admission_event_kind NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.admission_documents(id) ON DELETE SET NULL,
  payload jsonb,                            -- dados livres do evento
  message text,                             -- mensagem human-readable pra timeline
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admission_events_journey ON public.admission_events(journey_id, created_at DESC);

-- Eventos não têm updated_at (immutable log)
-- Eventos são audit por natureza; não precisam audit_log_trigger

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.admission_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_events ENABLE ROW LEVEL SECURITY;

-- Helper macro: admin_gc lê tudo, gestor_gc/rh lê própria empresa.
-- (mesmo padrão das outras tabelas — copy/paste mantém auditabilidade)

-- admission_journeys
CREATE POLICY "admin_gc reads all journeys" ON public.admission_journeys
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own journeys" ON public.admission_journeys
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_journeys.company_id, auth.uid())
  );
CREATE POLICY "admin_gc writes journeys" ON public.admission_journeys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own journeys" ON public.admission_journeys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_journeys.company_id, auth.uid())
  );

-- admission_documents — segue mesmo padrão; candidato sem login NÃO usa RLS
-- (acesso público via Edge Function com token validado server-side)
CREATE POLICY "admin_gc reads all admission_docs" ON public.admission_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own admission_docs" ON public.admission_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_documents.company_id, auth.uid())
  );
CREATE POLICY "admin_gc writes admission_docs" ON public.admission_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own admission_docs" ON public.admission_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_documents.company_id, auth.uid())
  );

-- admission_events — read-only pra G&C; nunca escreve direto (só via app/Edge Function)
CREATE POLICY "admin_gc reads all events" ON public.admission_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own events" ON public.admission_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_events.company_id, auth.uid())
  );
CREATE POLICY "admin_gc inserts events" ON public.admission_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh'))
  );

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "admin_gc inserts events" ON public.admission_events;
--   DROP POLICY IF EXISTS "gestor_gc reads own events" ON public.admission_events;
--   DROP POLICY IF EXISTS "admin_gc reads all events" ON public.admission_events;
--   DROP POLICY IF EXISTS "gestor_gc writes own admission_docs" ON public.admission_documents;
--   DROP POLICY IF EXISTS "admin_gc writes admission_docs" ON public.admission_documents;
--   DROP POLICY IF EXISTS "gestor_gc reads own admission_docs" ON public.admission_documents;
--   DROP POLICY IF EXISTS "admin_gc reads all admission_docs" ON public.admission_documents;
--   DROP POLICY IF EXISTS "gestor_gc writes own journeys" ON public.admission_journeys;
--   DROP POLICY IF EXISTS "admin_gc writes journeys" ON public.admission_journeys;
--   DROP POLICY IF EXISTS "gestor_gc reads own journeys" ON public.admission_journeys;
--   DROP POLICY IF EXISTS "admin_gc reads all journeys" ON public.admission_journeys;
--   DROP TABLE IF EXISTS public.admission_events;
--   DROP TABLE IF EXISTS public.admission_documents;
--   DROP TABLE IF EXISTS public.admission_journeys;
--   DROP TYPE IF EXISTS public.admission_event_kind;
--   DROP TYPE IF EXISTS public.admission_document_status;
--   DROP TYPE IF EXISTS public.admission_journey_status;
-- COMMIT;
