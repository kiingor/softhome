-- Migration: 20260518193705_collaborator_full_sync_schema.sql
-- Description: prepara sync completa de colaboradores com api.softcom.cloud.
--   1. ~30 novos campos em collaborators
--   2. external_id + unique em 5 tabelas existentes (ferias, 13, exames,
--      dependentes, timeline) pra suportar upsert por external_id
--   3. 7 tabelas filhas novas: absences, extras, leaves, internships,
--      health_plans, emails, pdvs
--   4. RLS via has_module_permission('colaboradores', ...) + audit trigger
--      em todas as filhas PII + handle_updated_at onde aplicável
--
-- Excluídos do escopo: plantões, visa-vale, acessos_partner, acessos_helptools,
-- permissões (fluxo próprio do SoftHouse).

BEGIN;

-- ============================================================
-- Bloco 1 — novos campos em collaborators
-- ============================================================

ALTER TABLE public.collaborators
  ADD COLUMN support_username       text,
  ADD COLUMN gender                 text CHECK (gender IS NULL OR gender IN ('M', 'F')),
  ADD COLUMN ethnicity              text,
  ADD COLUMN education_level        text,
  ADD COLUMN rg_issuer              text,
  ADD COLUMN supervisor_id          uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  ADD COLUMN internal_location      text,
  ADD COLUMN subsector              text,
  ADD COLUMN agenda                 text,
  ADD COLUMN indicator_group        text,
  ADD COLUMN sales_group            text,
  ADD COLUMN is_homeoffice          boolean NOT NULL DEFAULT false,
  ADD COLUMN has_agenda_access      boolean NOT NULL DEFAULT false,
  ADD COLUMN inspira_date           date,
  ADD COLUMN inspira_value          numeric(12,2),
  ADD COLUMN current_salary         numeric(12,2),
  ADD COLUMN contracted_cnpj        text,
  ADD COLUMN ctps                   text,
  ADD COLUMN ctps_series            text,
  ADD COLUMN ctps_uf                text,
  ADD COLUMN bank_account           text,
  ADD COLUMN discord_id             text,
  ADD COLUMN commission_monthly     numeric(6,3),
  ADD COLUMN commission_license     numeric(6,3),
  ADD COLUMN commission_upgrade     numeric(6,3),
  ADD COLUMN commission_tef_install numeric(6,3),
  ADD COLUMN commission_tef_monthly numeric(6,3),
  ADD COLUMN is_manager_leader      boolean NOT NULL DEFAULT false,
  ADD COLUMN is_manager_director    boolean NOT NULL DEFAULT false,
  ADD COLUMN is_manager_support     boolean NOT NULL DEFAULT false,
  ADD COLUMN is_godfather           boolean NOT NULL DEFAULT false,
  ADD COLUMN phone_extension        text,
  ADD COLUMN radios_freeform        text;

CREATE INDEX idx_collaborators_supervisor ON public.collaborators(supervisor_id);

-- ============================================================
-- Bloco 2 — external_id + unique em tabelas existentes
-- ============================================================

ALTER TABLE public.vacation_periods             ADD COLUMN external_id text;
ALTER TABLE public.bonus_entries                ADD COLUMN external_id text;
ALTER TABLE public.occupational_exams           ADD COLUMN external_id text;
ALTER TABLE public.collaborator_dependents      ADD COLUMN external_id text;
ALTER TABLE public.collaborator_timeline_events ADD COLUMN external_id text;

ALTER TABLE public.vacation_periods
  ADD CONSTRAINT vacation_periods_collab_external_uk UNIQUE (collaborator_id, external_id);
ALTER TABLE public.bonus_entries
  ADD CONSTRAINT bonus_entries_collab_external_uk UNIQUE (collaborator_id, external_id);
ALTER TABLE public.occupational_exams
  ADD CONSTRAINT occupational_exams_collab_external_uk UNIQUE (collaborator_id, external_id);
ALTER TABLE public.collaborator_dependents
  ADD CONSTRAINT collaborator_dependents_collab_external_uk UNIQUE (collaborator_id, external_id);
ALTER TABLE public.collaborator_timeline_events
  ADD CONSTRAINT collaborator_timeline_events_collab_external_uk UNIQUE (collaborator_id, external_id);

-- ============================================================
-- Bloco 3 — novas tabelas filhas
-- ============================================================

-- 3.1 absences (absenteismos)
CREATE TABLE public.collaborator_absences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  external_id     text,
  occurred_on     date,
  days            numeric(5,2),
  reason          text,
  notes           text,
  has_certificate boolean NOT NULL DEFAULT false,
  bank_hours      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_absences_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_absences_collaborator ON public.collaborator_absences(collaborator_id);

-- 3.2 extras (adicionais)
CREATE TABLE public.collaborator_extras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id     uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  external_id         text,
  extra_type          text,
  description         text,
  value               numeric(12,2),
  is_disabled         boolean NOT NULL DEFAULT false,
  inspira_type        text,
  inspira_group       text,
  posted_by_username  text,
  posted_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_extras_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_extras_collaborator ON public.collaborator_extras(collaborator_id);

-- 3.3 leaves (afastamentos)
CREATE TABLE public.collaborator_leaves (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id     uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  external_id         text,
  reason_code         integer,
  start_date          date,
  end_date            date,
  description         text,
  has_certificate     boolean NOT NULL DEFAULT false,
  posted_by_username  text,
  posted_at           timestamptz,
  compensated         integer,
  trip_id             integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_leaves_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_leaves_collaborator ON public.collaborator_leaves(collaborator_id);

-- 3.4 internships (estagios)
CREATE TABLE public.collaborator_internships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id       uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  external_id           text,
  start_date            date,
  end_date              date,
  is_renewal            boolean NOT NULL DEFAULT false,
  notification_sent     boolean NOT NULL DEFAULT false,
  flagged               boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_internships_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_internships_collaborator ON public.collaborator_internships(collaborator_id);

-- 3.5 health_plans (planos de saúde/odonto)
CREATE TABLE public.collaborator_health_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id     uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  external_id         text,
  plan_name           text,
  registration_code   text,
  start_date          date,
  beneficiary_type    text,    -- TITULAR / DEPENDENTE
  beneficiary_name    text,
  beneficiary_birth   date,
  beneficiary_cpf     text,
  plan_value          numeric(12,2),
  notes               text,
  is_disabled         boolean NOT NULL DEFAULT false,
  disabled_at         date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_health_plans_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_health_plans_collaborator ON public.collaborator_health_plans(collaborator_id);

-- 3.6 emails (emails adicionais)
CREATE TABLE public.collaborator_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  external_id     text,
  email           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_emails_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_emails_collaborator ON public.collaborator_emails(collaborator_id);

-- 3.7 pdvs (M:N colaborador ↔ store)
CREATE TABLE public.collaborator_pdvs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id)    ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  store_id        uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  external_id     text,
  pdv_name        text,           -- nome livre do PDV (caso o store_id ainda não exista local)
  f10             integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collaborator_pdvs_collab_external_uk UNIQUE (collaborator_id, external_id)
);

CREATE INDEX idx_collab_pdvs_collaborator ON public.collaborator_pdvs(collaborator_id);
CREATE INDEX idx_collab_pdvs_store        ON public.collaborator_pdvs(store_id);

-- ============================================================
-- Bloco 4 — triggers (updated_at + audit) nas 7 tabelas novas
-- ============================================================

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'collaborator_absences',
    'collaborator_extras',
    'collaborator_leaves',
    'collaborator_internships',
    'collaborator_health_plans',
    'collaborator_emails',
    'collaborator_pdvs'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    -- updated_at trigger
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()',
      v_table, v_table
    );

    -- audit trigger (todas têm PII ou dado financeiro)
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()',
      v_table, v_table
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Bloco 5 — RLS nas 7 tabelas filhas (módulo 'colaboradores')
-- ============================================================

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'collaborator_absences',
    'collaborator_extras',
    'collaborator_leaves',
    'collaborator_internships',
    'collaborator_health_plans',
    'collaborator_emails',
    'collaborator_pdvs'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

    -- SELECT: quem pode ver colaboradores OU é admin G&C
    EXECUTE format(
      'CREATE POLICY "view_%I" ON public.%I FOR SELECT USING ('
      ' public.can_view_module(auth.uid(), company_id, ''colaboradores'')'
      ' OR public.is_admin_gc(auth.uid())'
      ')',
      v_table, v_table
    );

    -- INSERT
    EXECUTE format(
      'CREATE POLICY "insert_%I" ON public.%I FOR INSERT WITH CHECK ('
      ' public.has_module_permission(auth.uid(), company_id, ''colaboradores'', ''can_create'')'
      ')',
      v_table, v_table
    );

    -- UPDATE
    EXECUTE format(
      'CREATE POLICY "update_%I" ON public.%I FOR UPDATE USING ('
      ' public.has_module_permission(auth.uid(), company_id, ''colaboradores'', ''can_edit'')'
      ')',
      v_table, v_table
    );

    -- DELETE
    EXECUTE format(
      'CREATE POLICY "delete_%I" ON public.%I FOR DELETE USING ('
      ' public.has_module_permission(auth.uid(), company_id, ''colaboradores'', ''can_delete'')'
      ')',
      v_table, v_table
    );
  END LOOP;
END;
$$;

COMMIT;

-- ============================================================
-- ROLLBACK (executar em ordem inversa)
-- ============================================================
-- BEGIN;
--   -- Filhas novas (drop em cascata cuida das policies/triggers)
--   DROP TABLE IF EXISTS public.collaborator_pdvs         CASCADE;
--   DROP TABLE IF EXISTS public.collaborator_emails       CASCADE;
--   DROP TABLE IF EXISTS public.collaborator_health_plans CASCADE;
--   DROP TABLE IF EXISTS public.collaborator_internships  CASCADE;
--   DROP TABLE IF EXISTS public.collaborator_leaves       CASCADE;
--   DROP TABLE IF EXISTS public.collaborator_extras       CASCADE;
--   DROP TABLE IF EXISTS public.collaborator_absences     CASCADE;
--
--   -- external_id em tabelas existentes
--   ALTER TABLE public.collaborator_timeline_events DROP CONSTRAINT IF EXISTS collaborator_timeline_events_collab_external_uk;
--   ALTER TABLE public.collaborator_dependents      DROP CONSTRAINT IF EXISTS collaborator_dependents_collab_external_uk;
--   ALTER TABLE public.occupational_exams           DROP CONSTRAINT IF EXISTS occupational_exams_collab_external_uk;
--   ALTER TABLE public.bonus_entries                DROP CONSTRAINT IF EXISTS bonus_entries_collab_external_uk;
--   ALTER TABLE public.vacation_periods             DROP CONSTRAINT IF EXISTS vacation_periods_collab_external_uk;
--   ALTER TABLE public.collaborator_timeline_events DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.collaborator_dependents      DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.occupational_exams           DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.bonus_entries                DROP COLUMN IF EXISTS external_id;
--   ALTER TABLE public.vacation_periods             DROP COLUMN IF EXISTS external_id;
--
--   -- Colunas novas em collaborators
--   DROP INDEX IF EXISTS public.idx_collaborators_supervisor;
--   ALTER TABLE public.collaborators
--     DROP COLUMN IF EXISTS radios_freeform,
--     DROP COLUMN IF EXISTS phone_extension,
--     DROP COLUMN IF EXISTS is_godfather,
--     DROP COLUMN IF EXISTS is_manager_support,
--     DROP COLUMN IF EXISTS is_manager_director,
--     DROP COLUMN IF EXISTS is_manager_leader,
--     DROP COLUMN IF EXISTS commission_tef_monthly,
--     DROP COLUMN IF EXISTS commission_tef_install,
--     DROP COLUMN IF EXISTS commission_upgrade,
--     DROP COLUMN IF EXISTS commission_license,
--     DROP COLUMN IF EXISTS commission_monthly,
--     DROP COLUMN IF EXISTS discord_id,
--     DROP COLUMN IF EXISTS bank_account,
--     DROP COLUMN IF EXISTS ctps_uf,
--     DROP COLUMN IF EXISTS ctps_series,
--     DROP COLUMN IF EXISTS ctps,
--     DROP COLUMN IF EXISTS contracted_cnpj,
--     DROP COLUMN IF EXISTS current_salary,
--     DROP COLUMN IF EXISTS inspira_value,
--     DROP COLUMN IF EXISTS inspira_date,
--     DROP COLUMN IF EXISTS has_agenda_access,
--     DROP COLUMN IF EXISTS is_homeoffice,
--     DROP COLUMN IF EXISTS sales_group,
--     DROP COLUMN IF EXISTS indicator_group,
--     DROP COLUMN IF EXISTS agenda,
--     DROP COLUMN IF EXISTS subsector,
--     DROP COLUMN IF EXISTS internal_location,
--     DROP COLUMN IF EXISTS supervisor_id,
--     DROP COLUMN IF EXISTS rg_issuer,
--     DROP COLUMN IF EXISTS education_level,
--     DROP COLUMN IF EXISTS ethnicity,
--     DROP COLUMN IF EXISTS gender,
--     DROP COLUMN IF EXISTS support_username;
-- COMMIT;
