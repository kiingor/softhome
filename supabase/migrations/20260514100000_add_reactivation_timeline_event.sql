-- Migration: 20260514100000_add_reactivation_timeline_event.sql
-- Description: adiciona o evento 'reactivation' no enum de eventos da timeline
-- e atualiza o trigger para registrar quando um colaborador volta de 'inativo'
-- para qualquer outro status (ativo, etc.). Antes existia só 'termination'
-- na transição inativo, não tinha o retorno — então quem reativava perdia
-- o rastro no histórico.

BEGIN;

-- 1) Adiciona o novo valor no enum (idempotente)
ALTER TYPE public.collaborator_timeline_event_type
  ADD VALUE IF NOT EXISTS 'reactivation';

COMMIT;

-- 2) Recria a função do trigger com o novo bloco. Em transaction separada
-- pois o valor do enum precisa estar commitado antes de ser referenciado.
BEGIN;

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
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'termination',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        auth.uid()
      );
    END IF;

    -- Reativação (volta de inativo pra qualquer outro status)
    IF OLD.status = 'inativo' AND NEW.status <> 'inativo' THEN
      INSERT INTO public.collaborator_timeline_events (
        company_id, collaborator_id, event_type, from_value, to_value, created_by
      ) VALUES (
        NEW.company_id, NEW.id, 'reactivation',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status),
        auth.uid()
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Reverter a função pra versão anterior (sem o bloco de reativação).
-- O valor do enum 'reactivation' não pode ser removido em Postgres,
-- então fica como dead-value (sem impacto).
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.log_collaborator_timeline_event()
-- ... (versão anterior — ver 20260512100600_create_collaborator_timeline.sql)
-- COMMIT;
