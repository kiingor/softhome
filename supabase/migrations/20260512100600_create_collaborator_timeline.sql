-- Migration: 20260512100600_create_collaborator_timeline.sql
-- Description: linha do tempo do colaborador. Cada evento (mudança de loja,
-- cargo, time, regime, salário, migração para outra empresa) é registrado
-- automaticamente via trigger quando o registro do colaborador é atualizado,
-- preservando a transição (from → to) para auditoria de carreira.

BEGIN;

CREATE TYPE public.collaborator_timeline_event_type AS ENUM (
  'store_change',       -- mudou de loja (store_id)
  'position_change',    -- mudou de cargo (position_id)
  'team_change',        -- mudou de time (team_id)
  'regime_change',      -- mudou regime (CLT/PJ/Estagiário)
  'salary_change',      -- mudou salário do cargo
  'migration',          -- migrou para outra empresa do grupo
  'admission',          -- admissão registrada
  'termination',        -- desligamento
  'manual'              -- evento adicionado manualmente pelo RH
);

CREATE TABLE public.collaborator_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  event_type public.collaborator_timeline_event_type NOT NULL,
  from_value jsonb,
  to_value jsonb,
  reason text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_timeline_collab
  ON public.collaborator_timeline_events(collaborator_id, effective_date DESC);
CREATE INDEX idx_timeline_company
  ON public.collaborator_timeline_events(company_id, effective_date DESC);

ALTER TABLE public.collaborator_timeline_events ENABLE ROW LEVEL SECURITY;

-- Read: RH + colaborador vê o próprio histórico
CREATE POLICY "Timeline events: RH and self read"
  ON public.collaborator_timeline_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
    OR EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_id AND c.user_id = auth.uid()
    )
  );

-- Insert/Update/Delete: RH (mas insert é principalmente via trigger)
CREATE POLICY "Timeline events: RH insert"
  ON public.collaborator_timeline_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh')
    )
  );

CREATE POLICY "Timeline events: RH delete"
  ON public.collaborator_timeline_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

-- Trigger: detecta mudanças em store_id, position_id, team_id, regime e
-- insere evento. SECURITY DEFINER para sempre ter permissão de gravar.
CREATE OR REPLACE FUNCTION public.log_collaborator_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- INSERT (admissão)
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.collaborator_timeline_events (
      company_id, collaborator_id, event_type, to_value, effective_date, created_by
    ) VALUES (
      NEW.company_id, NEW.id, 'admission',
      jsonb_build_object(
        'position_id', NEW.position_id,
        'store_id', NEW.store_id,
        'regime', NEW.regime
      ),
      COALESCE(NEW.admission_date::date, CURRENT_DATE),
      auth.uid()
    );
    RETURN NEW;
  END IF;

  -- UPDATE: detecta cada tipo de mudança
  IF TG_OP = 'UPDATE' THEN
    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'store_change',
        jsonb_build_object('store_id', OLD.store_id),
        jsonb_build_object('store_id', NEW.store_id),
        auth.uid()
      );
    END IF;

    IF NEW.position_id IS DISTINCT FROM OLD.position_id THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'position_change',
        jsonb_build_object('position_id', OLD.position_id),
        jsonb_build_object('position_id', NEW.position_id),
        auth.uid()
      );
    END IF;

    IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'team_change',
        jsonb_build_object('team_id', OLD.team_id),
        jsonb_build_object('team_id', NEW.team_id),
        auth.uid()
      );
    END IF;

    IF NEW.regime IS DISTINCT FROM OLD.regime THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'regime_change',
        jsonb_build_object('regime', OLD.regime),
        jsonb_build_object('regime', NEW.regime),
        auth.uid()
      );
    END IF;

    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'migration',
        jsonb_build_object('company_id', OLD.company_id),
        jsonb_build_object('company_id', NEW.company_id),
        auth.uid()
      );
    END IF;

    -- Desligamento
    IF OLD.status <> 'inativo' AND NEW.status = 'inativo' THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'termination',
        jsonb_build_object('status', NEW.status),
        auth.uid()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_collaborator_timeline ON public.collaborators;
CREATE TRIGGER trg_collaborator_timeline
  AFTER INSERT OR UPDATE ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.log_collaborator_timeline_event();

COMMENT ON TABLE public.collaborator_timeline_events IS
  'Linha do tempo do colaborador: movimentações de loja, cargo, time, regime, migrações. Populado por trigger.';

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_collaborator_timeline ON public.collaborators;
-- DROP FUNCTION IF EXISTS public.log_collaborator_timeline_event();
-- DROP TABLE IF EXISTS public.collaborator_timeline_events;
-- DROP TYPE IF EXISTS public.collaborator_timeline_event_type;
-- COMMIT;
