-- Migration: 20260428170000_rename_app_roles.sql
-- Description: renomeia roles legados pra os roles de produto SoftHome
-- conforme ADR 0002.
--
-- Mudanças finais:
--   'admin' (legacy)  -> 'admin_gc'
--   'rh'    (legacy)  -> mergeado em 'admin_gc'
--   novo 'gestor_gc' adicionado
--
-- Idempotente: DO block com EXECUTE dinâmico, ordem rename-primeiro-
-- depois-update pra garantir que 'admin_gc' já exista quando rh rows
-- forem migrados. Roda corretamente em estado fresco, parcial ou
-- completo.

DO $$
BEGIN
  -- 1. Renomeia 'admin' -> 'admin_gc' (se ainda não foi)
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype
      AND enumlabel = 'admin'
  ) THEN
    EXECUTE $stmt$ALTER TYPE public.app_role RENAME VALUE 'admin' TO 'admin_gc'$stmt$;
  END IF;

  -- 2. Migra rows com role='rh' pra 'admin_gc' (target final)
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.app_role'::regtype
      AND enumlabel = 'rh'
  ) THEN
    EXECUTE $stmt$UPDATE public.user_roles SET role = 'admin_gc' WHERE role = 'rh'$stmt$;
  END IF;
END$$;

-- 3. Adiciona 'gestor_gc' (idempotente)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_gc';

-- ROLLBACK
-- ALTER TYPE public.app_role RENAME VALUE 'admin_gc' TO 'admin';
-- ('rh' rows migrados pra admin_gc não têm como separar de volta;
--  'gestor_gc' não pode ser DROP-ado em PG sem recreate-enum.)
