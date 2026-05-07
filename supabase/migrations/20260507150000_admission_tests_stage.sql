-- Stage 1 da admissão: testes (lógica, informática, DISC, BigFive).
-- Antes da fase de docs/dados (que vira stage 2). Conteúdo das perguntas
-- vive em src/modules/admission/lib/tests/<slug>.ts pra evitar payload
-- gigante em SQL; o catálogo aqui só armazena qual está ativo + config.

-- ============================================================
-- ENUMS
-- ============================================================
ALTER TYPE public.admission_journey_status ADD VALUE IF NOT EXISTS 'tests_pending' BEFORE 'docs_pending';
ALTER TYPE public.admission_journey_status ADD VALUE IF NOT EXISTS 'tests_in_review' BEFORE 'docs_pending';

ALTER TYPE public.admission_event_kind ADD VALUE IF NOT EXISTS 'tests_assigned';
ALTER TYPE public.admission_event_kind ADD VALUE IF NOT EXISTS 'test_started';
ALTER TYPE public.admission_event_kind ADD VALUE IF NOT EXISTS 'test_completed';
ALTER TYPE public.admission_event_kind ADD VALUE IF NOT EXISTS 'tests_advanced';

CREATE TYPE public.admission_test_status AS ENUM (
  'not_started',  -- atribuído mas candidato ainda não começou
  'in_progress',  -- candidato começou, salvou progresso
  'completed',    -- candidato finalizou — auto-corrige perguntas objetivas
  'reviewed'      -- RH avaliou (incluindo perguntas abertas, se houver)
);

-- ============================================================
-- admission_tests (catálogo por empresa)
-- ============================================================
-- Cada empresa pode habilitar/desabilitar testes do catálogo padrão e
-- ajustar tempo/pausa. O `slug` casa com o conteúdo em código:
--   'informatica' | 'logica' | 'disc' | 'bigfive_30' | 'bigfive_50'
--   | 'bigfive_120'
CREATE TABLE public.admission_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  category text,                          -- 'aptidao' | 'comportamental' | 'personalidade'
  is_active boolean NOT NULL DEFAULT true,
  time_limit_minutes integer,             -- null = sem limite
  allow_pause boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE INDEX idx_admission_tests_company ON public.admission_tests(company_id, is_active);

CREATE TRIGGER set_updated_at_admission_tests
  BEFORE UPDATE ON public.admission_tests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_admission_tests
  AFTER INSERT OR UPDATE OR DELETE ON public.admission_tests
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- admission_journey_tests (atribuição por jornada)
-- ============================================================
CREATE TABLE public.admission_journey_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES public.admission_journeys(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.admission_tests(id) ON DELETE RESTRICT,
  test_slug text NOT NULL,                -- snapshot do slug pra histórico
  status public.admission_test_status NOT NULL DEFAULT 'not_started',
  -- Progresso e resultado
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,         -- { "q1": "A", "q2": "B", ... }
  auto_score numeric(6,2),                            -- pontuação automática (0-100)
  reviewer_score numeric(6,2),                        -- RH avaliou abertas (0-100)
  result_summary jsonb,                               -- agregados específicos do teste (ex: DISC perfil, BigFive traços)
  -- Timing
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journey_id, test_id)
);

CREATE INDEX idx_admission_journey_tests_journey ON public.admission_journey_tests(journey_id);
CREATE INDEX idx_admission_journey_tests_test ON public.admission_journey_tests(test_id);

CREATE TRIGGER set_updated_at_admission_journey_tests
  BEFORE UPDATE ON public.admission_journey_tests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_admission_journey_tests
  AFTER INSERT OR UPDATE OR DELETE ON public.admission_journey_tests
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- RLS — segue mesmo padrão de admission_journeys (role check inline)
-- ============================================================
ALTER TABLE public.admission_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_journey_tests ENABLE ROW LEVEL SECURITY;

-- admission_tests
CREATE POLICY "admin_gc reads all admission_tests" ON public.admission_tests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc reads own admission_tests" ON public.admission_tests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_tests.company_id, auth.uid())
  );

CREATE POLICY "admin_gc writes admission_tests" ON public.admission_tests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc writes own admission_tests" ON public.admission_tests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(admission_tests.company_id, auth.uid())
  );

-- admission_journey_tests — usa join na journey pra resolver company_id
CREATE POLICY "admin_gc reads all journey_tests" ON public.admission_journey_tests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc reads own journey_tests" ON public.admission_journey_tests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND EXISTS (
      SELECT 1 FROM public.admission_journeys j
      WHERE j.id = admission_journey_tests.journey_id
        AND public.user_belongs_to_company(j.company_id, auth.uid())
    )
  );

CREATE POLICY "admin_gc writes journey_tests" ON public.admission_journey_tests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "gestor_gc writes own journey_tests" ON public.admission_journey_tests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('gestor_gc', 'rh'))
    AND EXISTS (
      SELECT 1 FROM public.admission_journeys j
      WHERE j.id = admission_journey_tests.journey_id
        AND public.user_belongs_to_company(j.company_id, auth.uid())
    )
  );

-- ============================================================
-- Seed: testes padrão por empresa.
-- Cada empresa nova ganha o catálogo completo já ativo. Empresas
-- existentes recebem via INSERT abaixo.
-- ============================================================
INSERT INTO public.admission_tests (company_id, slug, name, description, category, is_active, time_limit_minutes, allow_pause)
SELECT
  c.id,
  v.slug,
  v.name,
  v.description,
  v.category,
  v.is_active,
  v.time_limit_minutes,
  v.allow_pause
FROM public.companies c
CROSS JOIN (VALUES
  ('logica',      'Prova de Lógica',        'Raciocínio lógico-matemático e atenção a detalhes', 'aptidao',         true, 30,   true),
  ('informatica', 'Prova de Informática',   'Conhecimentos básicos de informática e Windows',     'aptidao',         true, 25,   true),
  ('disc',        'Perfil Comportamental (DISC)', 'Mapeia perfil comportamental em 4 fatores: D, I, S, C', 'comportamental', true, 15,   true),
  ('bigfive_50',  'Personalidade — BigFive (50)', 'Os 5 grandes traços de personalidade — versão padrão', 'personalidade', true, 15,   true),
  ('bigfive_30',  'Personalidade — BigFive (30, rápido)', 'Versão curta dos 5 grandes traços (~6 min)', 'personalidade', false, 10,   true),
  ('bigfive_120', 'Personalidade — IPIP-NEO 120', 'Versão completa: 5 traços + 30 facetas (~25 min)', 'personalidade', false, 30,   true)
) AS v(slug, name, description, category, is_active, time_limit_minutes, allow_pause)
ON CONFLICT (company_id, slug) DO NOTHING;

-- ============================================================
-- Trigger: empresa nova ganha catálogo automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_admission_tests_for_company()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admission_tests (company_id, slug, name, description, category, is_active, time_limit_minutes, allow_pause)
  VALUES
    (NEW.id, 'logica',      'Prova de Lógica',        'Raciocínio lógico-matemático e atenção a detalhes', 'aptidao',         true, 30, true),
    (NEW.id, 'informatica', 'Prova de Informática',   'Conhecimentos básicos de informática e Windows',     'aptidao',         true, 25, true),
    (NEW.id, 'disc',        'Perfil Comportamental (DISC)', 'Mapeia perfil comportamental em 4 fatores', 'comportamental', true, 15, true),
    (NEW.id, 'bigfive_50',  'Personalidade — BigFive (50)', 'Os 5 grandes traços de personalidade', 'personalidade', true, 15, true),
    (NEW.id, 'bigfive_30',  'Personalidade — BigFive (30, rápido)', 'Versão curta dos 5 traços', 'personalidade', false, 10, true),
    (NEW.id, 'bigfive_120', 'Personalidade — IPIP-NEO 120', 'Versão completa: 5 traços + 30 facetas', 'personalidade', false, 30, true)
  ON CONFLICT (company_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER seed_admission_tests_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_admission_tests_for_company();

-- ============================================================
-- Rollback (não executar a menos que precise reverter):
-- DROP TRIGGER IF EXISTS seed_admission_tests_on_company_insert ON public.companies;
-- DROP FUNCTION IF EXISTS public.seed_admission_tests_for_company();
-- DROP TABLE IF EXISTS public.admission_journey_tests;
-- DROP TABLE IF EXISTS public.admission_tests;
-- DROP TYPE IF EXISTS public.admission_test_status;
-- (enums novos em admission_journey_status / admission_event_kind não dá pra remover sem dropar a coluna inteira)
-- ============================================================
