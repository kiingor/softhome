-- Migration: 20260506180501_create_collaborator_notifications.sql
-- Description: tabela de notificações in-app do Portal do Colaborador.
-- O Portal subscreve via Supabase Realtime e renderiza um sino + animação
-- celebratória quando type='bonus_*_paid' ou similar.
--
-- Fundação genérica: outros eventos do Portal (folha disponível, exame,
-- férias aprovadas, etc.) podem reusar a mesma tabela.

BEGIN;

-- ============================================================
-- collaborator_notifications
-- ============================================================
CREATE TABLE public.collaborator_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  type text NOT NULL,                    -- 'bonus_first_paid', 'bonus_second_paid', 'bonus_anticipated', etc.
  title text NOT NULL,
  body text,
  payload jsonb,                          -- dados extras (valor, ano, etc.)
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_collab_notif_collaborator
  ON public.collaborator_notifications(collaborator_id, created_at DESC);

CREATE INDEX idx_collab_notif_unread
  ON public.collaborator_notifications(collaborator_id) WHERE is_read = false;

-- ============================================================
-- RLS — colaborador só lê/atualiza as suas próprias.
-- ============================================================
ALTER TABLE public.collaborator_notifications ENABLE ROW LEVEL SECURITY;

-- Colaborador lê suas notificações via collaborators.user_id = auth.uid()
CREATE POLICY "collaborator reads own notifications"
  ON public.collaborator_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_notifications.collaborator_id
        AND c.user_id = auth.uid()
    )
  );

-- Colaborador marca como lida (UPDATE) suas próprias.
CREATE POLICY "collaborator updates own notifications"
  ON public.collaborator_notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_notifications.collaborator_id
        AND c.user_id = auth.uid()
    )
  );

-- Admin/RH lê tudo (pra debug ou central de comunicação).
CREATE POLICY "admin_gc reads all notifications"
  ON public.collaborator_notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin', 'gestor_gc', 'rh'))
  );

-- INSERT/DELETE não tem policy = bloqueado pro authenticated.
-- Edge Functions com service_role contornam RLS pra escrever.

-- ============================================================
-- Realtime — habilita publicação supabase_realtime pra tabela.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaborator_notifications;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.collaborator_notifications;
--   DROP TABLE IF EXISTS public.collaborator_notifications;
-- COMMIT;
