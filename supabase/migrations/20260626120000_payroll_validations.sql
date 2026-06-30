-- Migration: 20260626120000_payroll_validations.sql
-- Description: Validação da Folha. Concilia a folha interna (payroll_entries) com
-- a "Relação de Cálculo" que a contabilidade envia em PDF. Cada sessão de
-- validação (por competência) guarda os ITENS divergentes (esperado=PDF x
-- atual=sistema, com tolerância de ±R$0,05 aplicada no cálculo), que o RH marca
-- como "Corrigido" ou "Ignorado" (com observação), e um LOG de eventos.
--
-- LGPD/auditoria: os valores aqui são DERIVADOS (comparação) — a fonte de PII
-- (collaborators, payroll_entries) já tem audit trigger próprio. A trilha de
-- auditoria DESTE módulo é a tabela payroll_validation_logs, que registra quem
-- iniciou, quem resolveu/ignorou cada item, quando e com qual observação. Por
-- isso não duplicamos via audit_log_trigger (evita logar snapshots grandes).
--
-- Escrita só via RPC SECURITY DEFINER (create/resolve) — sem policy de
-- INSERT/UPDATE direto. A UI só faz SELECT.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabelas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference_month date NOT NULL,                 -- competência (YYYY-MM-01)
  status text NOT NULL DEFAULT 'in_progress',    -- in_progress | completed
  pdf_file_names text[] NOT NULL DEFAULT '{}',
  collaborators_total int NOT NULL DEFAULT 0,    -- colaboradores lidos do(s) PDF(s)
  collaborators_matched int NOT NULL DEFAULT 0,  -- casados com a base
  items_total int NOT NULL DEFAULT 0,
  items_resolved int NOT NULL DEFAULT 0,         -- corrigidos + ignorados
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_validation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id uuid NOT NULL REFERENCES public.payroll_validations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  collaborator_name text NOT NULL,               -- nome do PDF (mostra mesmo sem match)
  check_group text NOT NULL,                      -- salario|inss|irpf|fgts|salario_familia|plano_saude|vale_transporte|emprestimo|desconto|liquido|dependentes_ir|dependentes_sf|...
  check_label text NOT NULL,                       -- rótulo amigável
  expected_value numeric(12, 2),                   -- PDF (contabilidade)
  actual_value numeric(12, 2),                     -- sistema (folha)
  diff numeric(12, 2),                             -- expected - actual
  direction text,                                  -- a_mais | a_menos | null
  severity text NOT NULL DEFAULT 'divergence',     -- divergence | missing_system | missing_pdf | info
  status text NOT NULL DEFAULT 'pending',          -- pending | corrected | ignored
  notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id uuid NOT NULL REFERENCES public.payroll_validations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.payroll_validation_items(id) ON DELETE SET NULL,
  action text NOT NULL,                            -- started | marked_corrected | marked_ignored | reopened
  notes text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_validations_company_month
  ON public.payroll_validations (company_id, reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_validation_items_validation
  ON public.payroll_validation_items (validation_id);
CREATE INDEX IF NOT EXISTS idx_payroll_validation_items_validation_status
  ON public.payroll_validation_items (validation_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_validation_logs_validation
  ON public.payroll_validation_logs (validation_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_payroll_validations_updated_at ON public.payroll_validations;
CREATE TRIGGER trg_payroll_validations_updated_at
  BEFORE UPDATE ON public.payroll_validations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_validation_items_updated_at ON public.payroll_validation_items;
CREATE TRIGGER trg_payroll_validation_items_updated_at
  BEFORE UPDATE ON public.payroll_validation_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — só SELECT (escrita é via RPC SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_validation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_validation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gc reads all validations" ON public.payroll_validations;
DROP POLICY IF EXISTS "company reads own validations" ON public.payroll_validations;
DROP POLICY IF EXISTS "admin_gc reads all validation items" ON public.payroll_validation_items;
DROP POLICY IF EXISTS "company reads own validation items" ON public.payroll_validation_items;
DROP POLICY IF EXISTS "admin_gc reads all validation logs" ON public.payroll_validation_logs;
DROP POLICY IF EXISTS "company reads own validation logs" ON public.payroll_validation_logs;

CREATE POLICY "admin_gc reads all validations" ON public.payroll_validations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "company reads own validations" ON public.payroll_validations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND public.user_belongs_to_company(payroll_validations.company_id, auth.uid())
  );

CREATE POLICY "admin_gc reads all validation items" ON public.payroll_validation_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "company reads own validation items" ON public.payroll_validation_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND public.user_belongs_to_company(payroll_validation_items.company_id, auth.uid())
  );

CREATE POLICY "admin_gc reads all validation logs" ON public.payroll_validation_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "company reads own validation logs" ON public.payroll_validation_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND public.user_belongs_to_company(payroll_validation_logs.company_id, auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permissão (compartilhada pelas RPCs)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_payroll_validation(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_gc(auth.uid())
      OR public.has_module_permission(auth.uid(), p_company_id, 'financeiro', 'can_edit');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC — cria a validação + itens + log 'started' (atômico)
-- p_items: jsonb array de objetos com as chaves dos itens (ver TS).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_payroll_validation(
  p_company_id      uuid,
  p_reference_month date,
  p_pdf_names       text[],
  p_stats           jsonb,
  p_items           jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_count int := coalesce(jsonb_array_length(p_items), 0);
BEGIN
  IF NOT public.can_manage_payroll_validation(p_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para validar a folha';
  END IF;

  INSERT INTO public.payroll_validations (
    company_id, reference_month, status, pdf_file_names,
    collaborators_total, collaborators_matched, items_total, items_resolved, created_by
  ) VALUES (
    p_company_id, p_reference_month, 'in_progress', coalesce(p_pdf_names, '{}'),
    coalesce((p_stats->>'collaborators_total')::int, 0),
    coalesce((p_stats->>'collaborators_matched')::int, 0),
    v_count, 0, auth.uid()
  )
  RETURNING id INTO v_id;

  IF v_count > 0 THEN
    INSERT INTO public.payroll_validation_items (
      validation_id, company_id, collaborator_id, collaborator_name,
      check_group, check_label, expected_value, actual_value, diff, direction, severity
    )
    SELECT
      v_id, p_company_id,
      nullif(it->>'collaborator_id', '')::uuid,
      it->>'collaborator_name',
      it->>'check_group',
      it->>'check_label',
      nullif(it->>'expected_value', '')::numeric,
      nullif(it->>'actual_value', '')::numeric,
      nullif(it->>'diff', '')::numeric,
      nullif(it->>'direction', ''),
      coalesce(it->>'severity', 'divergence')
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  INSERT INTO public.payroll_validation_logs (validation_id, company_id, action, notes, user_id)
  VALUES (v_id, p_company_id, 'started',
          format('Validação iniciada — %s divergência(s) em %s colaborador(es)', v_count,
                 coalesce((p_stats->>'collaborators_total')::int, 0)),
          auth.uid());

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC — resolve/ignora/reabre um item (atualiza % e loga)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_payroll_validation_item(
  p_item_id uuid,
  p_status  text,
  p_notes   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_validation_id uuid;
  v_resolved      int;
  v_total         int;
  v_action        text;
  v_notes         text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF p_status NOT IN ('pending', 'corrected', 'ignored') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  SELECT company_id, validation_id INTO v_company_id, v_validation_id
    FROM public.payroll_validation_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de validação não encontrado';
  END IF;

  IF NOT public.can_manage_payroll_validation(v_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a validação';
  END IF;

  UPDATE public.payroll_validation_items
     SET status = p_status,
         notes = v_notes,
         resolved_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
         resolved_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
   WHERE id = p_item_id;

  -- Recalcula o progresso da sessão.
  SELECT count(*) FILTER (WHERE status <> 'pending'), count(*)
    INTO v_resolved, v_total
    FROM public.payroll_validation_items WHERE validation_id = v_validation_id;

  UPDATE public.payroll_validations
     SET items_resolved = v_resolved,
         status = CASE WHEN v_total > 0 AND v_resolved >= v_total THEN 'completed' ELSE 'in_progress' END
   WHERE id = v_validation_id;

  v_action := CASE p_status
                WHEN 'corrected' THEN 'marked_corrected'
                WHEN 'ignored'   THEN 'marked_ignored'
                ELSE 'reopened'
              END;

  INSERT INTO public.payroll_validation_logs (validation_id, company_id, item_id, action, notes, user_id)
  VALUES (v_validation_id, v_company_id, p_item_id, v_action, v_notes, auth.uid());
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC — resolve/ignora vários itens de uma vez (ação em massa pela UI)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_payroll_validation_items_bulk(
  p_item_ids uuid[],
  p_status   text,
  p_notes    text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_validation_id uuid;
  v_resolved      int;
  v_total         int;
  v_action        text;
  v_notes         text := nullif(btrim(coalesce(p_notes, '')), '');
  v_n             int := 0;
BEGIN
  IF p_status NOT IN ('pending', 'corrected', 'ignored') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Todos os itens têm de ser da MESMA validação (a UI já garante isso).
  SELECT count(DISTINCT validation_id), min(validation_id), min(company_id)
    INTO v_total, v_validation_id, v_company_id
    FROM public.payroll_validation_items WHERE id = ANY(p_item_ids);
  IF v_validation_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum item encontrado';
  END IF;
  IF v_total <> 1 THEN
    RAISE EXCEPTION 'Os itens precisam ser da mesma validação';
  END IF;

  IF NOT public.can_manage_payroll_validation(v_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a validação';
  END IF;

  UPDATE public.payroll_validation_items
     SET status = p_status,
         notes = v_notes,
         resolved_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END,
         resolved_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
   WHERE id = ANY(p_item_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT count(*) FILTER (WHERE status <> 'pending'), count(*)
    INTO v_resolved, v_total
    FROM public.payroll_validation_items WHERE validation_id = v_validation_id;

  UPDATE public.payroll_validations
     SET items_resolved = v_resolved,
         status = CASE WHEN v_total > 0 AND v_resolved >= v_total THEN 'completed' ELSE 'in_progress' END
   WHERE id = v_validation_id;

  v_action := CASE p_status
                WHEN 'corrected' THEN 'marked_corrected'
                WHEN 'ignored'   THEN 'marked_ignored'
                ELSE 'reopened'
              END;

  INSERT INTO public.payroll_validation_logs (validation_id, company_id, action, notes, user_id)
  VALUES (v_validation_id, v_company_id, v_action,
          format('%s item(ns) em massa%s', v_n, CASE WHEN v_notes IS NULL THEN '' ELSE ' — ' || v_notes END),
          auth.uid());

  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_payroll_validation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payroll_validation(uuid, date, text[], jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payroll_validation_item(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payroll_validation_items_bulk(uuid[], text, text) TO authenticated;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.resolve_payroll_validation_items_bulk(uuid[], text, text);
--   DROP FUNCTION IF EXISTS public.resolve_payroll_validation_item(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.create_payroll_validation(uuid, date, text[], jsonb, jsonb);
--   DROP FUNCTION IF EXISTS public.can_manage_payroll_validation(uuid);
--   DROP TABLE IF EXISTS public.payroll_validation_logs;
--   DROP TABLE IF EXISTS public.payroll_validation_items;
--   DROP TABLE IF EXISTS public.payroll_validations;
-- COMMIT;
