-- Migration: 20260427130200_create_audit_log.sql
-- Description: cria tabela centralizada audit_log + função trigger
-- 'audit_log_trigger()' que pode ser anexada a qualquer tabela com PII.
--
-- LGPD obrigatório (CLAUDE.md princípio 1). Toda tabela com PII (cpf,
-- rg, salário, endereço completo) deve ter audit trigger anexada.
--
-- Esta migration cria apenas a infraestrutura. Anexar o trigger a
-- tabelas específicas (collaborators, collaborator_documents, etc.)
-- vem em migrations futuras quando cada módulo for finalizado.

BEGIN;

-- 1. Tabela audit_log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Índices pra queries comuns
CREATE INDEX idx_audit_log_table_record
  ON public.audit_log(table_name, record_id);

CREATE INDEX idx_audit_log_user
  ON public.audit_log(user_id);

CREATE INDEX idx_audit_log_company
  ON public.audit_log(company_id);

CREATE INDEX idx_audit_log_created_desc
  ON public.audit_log(created_at DESC);

-- 3. Função trigger reutilizável
-- Anexar via: CREATE TRIGGER audit_<tabela> AFTER INSERT OR UPDATE OR DELETE
--             ON public.<tabela> FOR EACH ROW
--             EXECUTE FUNCTION public.audit_log_trigger();
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_record_id uuid;
  v_company_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  -- Determinar ação
  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    v_record_id := (to_jsonb(NEW)->>'id')::uuid;
    v_company_id := NULLIF(to_jsonb(NEW)->>'company_id', '')::uuid;
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_record_id := (to_jsonb(NEW)->>'id')::uuid;
    v_company_id := NULLIF(to_jsonb(NEW)->>'company_id', '')::uuid;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_record_id := (to_jsonb(OLD)->>'id')::uuid;
    v_company_id := NULLIF(to_jsonb(OLD)->>'company_id', '')::uuid;
    v_before := to_jsonb(OLD);
    v_after := NULL;
  END IF;

  INSERT INTO public.audit_log (
    user_id, company_id, action, table_name, record_id, before, after
  ) VALUES (
    auth.uid(), v_company_id, v_action, TG_TABLE_NAME, v_record_id, v_before, v_after
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. RLS — só admin_gc lê audit; ninguém escreve direto (só via trigger)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Read: admin_gc da matriz vê tudo; gestor_gc vê só sua empresa
CREATE POLICY "admin_gc reads all audit"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_gc', 'admin')
    )
  );

CREATE POLICY "gestor_gc reads own company audit"
  ON public.audit_log FOR SELECT
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('gestor_gc', 'rh')
        AND ur.company_id = audit_log.company_id
    )
  );

-- Write: ninguém. Apenas a trigger function (SECURITY DEFINER) escreve.
-- Sem policy de INSERT/UPDATE/DELETE = bloqueado pra usuários autenticados.

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP POLICY IF EXISTS "gestor_gc reads own company audit" ON public.audit_log;
--   DROP POLICY IF EXISTS "admin_gc reads all audit" ON public.audit_log;
--   DROP FUNCTION IF EXISTS public.audit_log_trigger() CASCADE;
--   DROP TABLE IF EXISTS public.audit_log;
-- COMMIT;
