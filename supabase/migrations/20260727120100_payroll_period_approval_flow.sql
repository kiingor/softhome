-- Migration: 20260727120100_payroll_period_approval_flow.sql
-- Description: fluxo de aprovação da folha pela diretoria.
--   open (rótulo "Rascunho") → aprovado_rh → aprovado_diretoria → closed → exported
--
-- REGRA DE PRODUTO (crítica): a folha SÓ TRAVA quando a DIRETORIA aprova. Em
-- 'open' E em 'aprovado_rh' o RH continua criando/editando/excluindo
-- lançamentos. Toda a trava vive em public.payroll_period_is_locked() — fonte
-- única, usada pela RPC de exclusão, pelo trigger de payroll_entries e espelhada
-- no front. Isso CONTRARIA o código anterior, que tratava "status != open" como
-- fechado; os call sites do client são corrigidos na mesma PR.
--
-- DEPENDE de 20260727120000_add_diretoria_role_and_payroll_approval_status.sql
-- já COMITADA: aqui usamos 'aprovado_rh'/'aprovado_diretoria' em corpo de função
-- LANGUAGE sql e em predicado de índice parcial — seria "unsafe use of new value
-- of enum type" se estivesse na mesma transação que criou o label.
--
-- LGPD / auditoria (CLAUDE.md princípios 1 e 3):
--   • payroll_period_approvals é APPEND-ONLY e É a trilha do fluxo (quem
--     aprovou, quem devolveu, por quê, quando). Sem audit_log_trigger — ela
--     própria é o log (mesma decisão de payroll_validation_logs).
--   • payroll_period_notes guarda texto livre sobre a remuneração de pessoa
--     identificada → PII → audit_log_trigger anexada. Carrega company_id
--     denormalizado pra que a linha do audit_log tenha company_id (senão só
--     admin_gc enxerga o log — ver policy "gestor_gc reads own company audit").
--   • payroll_periods já tem audit trigger: os carimbos entram de graça.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colunas de projeção em payroll_periods ("estado atual" pra listagem)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_periods
  ADD COLUMN IF NOT EXISTS approved_rh_at   timestamptz,
  ADD COLUMN IF NOT EXISTS approved_rh_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_dir_at  timestamptz,
  ADD COLUMN IF NOT EXISTS approved_dir_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_at      timestamptz,
  ADD COLUMN IF NOT EXISTS returned_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_reason  text;

COMMENT ON COLUMN public.payroll_periods.returned_reason IS
  'Motivo da última devolução. É o canal de entrada do motivo: o client manda no mesmo UPDATE que muda o status; o trigger valida e carimba.';

-- Fila da diretoria: "folhas esperando minha aprovação".
CREATE INDEX IF NOT EXISTS idx_periods_pending_diretoria
  ON public.payroll_periods (company_id, reference_month DESC)
  WHERE status = 'aprovado_rh';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. payroll_period_approvals — histórico APPEND-ONLY das transições
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_period_approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id    uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status  public.payroll_period_status,
  to_status    public.payroll_period_status NOT NULL,
  action       text NOT NULL CHECK (action IN (
                 'approve_rh', 'approve_diretoria',
                 'return_to_rh', 'return_to_draft',
                 'close', 'export', 'reopen', 'other')),
  reason       text,   -- obrigatório nas devoluções (validado no trigger)
  actor_role   text NOT NULL CHECK (actor_role IN ('rh', 'diretoria', 'admin_gc', 'system')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payroll_period_approvals IS
  'Trilha append-only do fluxo de aprovação da folha. Escrita SÓ por trigger. Sem UPDATE/DELETE — nem por policy.';

CREATE INDEX IF NOT EXISTS idx_payroll_period_approvals_period
  ON public.payroll_period_approvals (period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_period_approvals_company
  ON public.payroll_period_approvals (company_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. payroll_period_notes — observação da FOLHA INTEIRA ou POR COLABORADOR
--    collaborator_id NULL     = observação da folha inteira
--    collaborator_id NOT NULL = observação daquela pessoa
--    author_stage separa a anotação do RH da anotação da DIRETORIA (as duas
--    podem existir pra mesma pessoa, por motivos diferentes).
--    NÃO substitui payroll_collaborator_reviews.observation (conferência do RH,
--    em uso pesado em produção) — as duas convivem.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_period_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  collaborator_id  uuid REFERENCES public.collaborators(id) ON DELETE CASCADE,
  -- Derivada: nunca drifta, e o front filtra por ela sem CASE.
  scope            text GENERATED ALWAYS AS (
                     CASE WHEN collaborator_id IS NULL THEN 'period' ELSE 'collaborator' END
                   ) STORED,
  author_stage     text NOT NULL DEFAULT 'rh' CHECK (author_stage IN ('rh', 'diretoria')),
  body             text NOT NULL CHECK (length(btrim(body)) >= 3),
  -- Snapshot do status da folha quando a nota foi escrita ("isso é de antes ou
  -- depois da devolução?").
  period_status_at_note public.payroll_period_status,
  is_resolved      boolean NOT NULL DEFAULT false,
  resolved_at      timestamptz,
  resolved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payroll_period_notes IS
  'Observações do fluxo de aprovação. collaborator_id NULL = folha inteira. Convive com payroll_collaborator_reviews.observation (conferência do RH).';

CREATE INDEX IF NOT EXISTS idx_payroll_period_notes_period
  ON public.payroll_period_notes (period_id, collaborator_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period_notes_collaborator
  ON public.payroll_period_notes (collaborator_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period_notes_open
  ON public.payroll_period_notes (period_id)
  WHERE is_resolved = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trava da folha — FONTE ÚNICA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_period_is_locked(p_status public.payroll_period_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- open e aprovado_rh continuam EDITÁVEIS pelo RH. Só trava a partir da
  -- aprovação da diretoria.
  SELECT p_status IN ('aprovado_diretoria', 'closed', 'exported');
$$;

CREATE OR REPLACE FUNCTION public.payroll_period_is_locked(p_company_id uuid, p_reference_month date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.payroll_period_is_locked(status)
    FROM public.payroll_periods
   WHERE company_id = p_company_id AND reference_month = p_reference_month;
$$;

-- Máquina de estados (compartilhada pelo trigger de validação e pelo de log).
CREATE OR REPLACE FUNCTION public.payroll_period_transition_action(
  p_from public.payroll_period_status,
  p_to   public.payroll_period_status
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = p_to THEN NULL
    WHEN p_from = 'open'               AND p_to = 'aprovado_rh'        THEN 'approve_rh'
    WHEN p_from = 'aprovado_rh'        AND p_to = 'aprovado_diretoria' THEN 'approve_diretoria'
    WHEN p_from = 'aprovado_rh'        AND p_to = 'open'               THEN 'return_to_draft'
    WHEN p_from = 'aprovado_diretoria' AND p_to = 'aprovado_rh'        THEN 'return_to_rh'
    WHEN p_from = 'aprovado_diretoria' AND p_to = 'open'               THEN 'return_to_draft'
    WHEN p_from = 'aprovado_diretoria' AND p_to = 'closed'             THEN 'close'
    WHEN p_from = 'closed'             AND p_to = 'exported'           THEN 'export'
    -- Compat com o fluxo legado (botões Fechar/Reabrir que já existem e fazem
    -- UPDATE direto — ver use-payroll.ts closePeriod/reopenPeriod).
    WHEN p_from IN ('open','aprovado_rh') AND p_to = 'closed'          THEN 'close'
    WHEN p_from = 'closed'             AND p_to IN ('open','aprovado_rh','aprovado_diretoria') THEN 'reopen'
    WHEN p_from = 'exported'           AND p_to IN ('open','closed')   THEN 'reopen'
    ELSE NULL
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Guard de transição — BEFORE UPDATE em payroll_periods
--    Fica no TRIGGER, não só na RPC: o front muda status com PATCH direto no
--    PostgREST (use-payroll.ts closePeriod/reopenPeriod), então uma RPC sozinha
--    não protegeria nada — o RH gravaria 'aprovado_diretoria' na mão e
--    auto-aprovaria. O trigger também CARIMBA no servidor: o client não forja
--    quem aprovou nem quando.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_period_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action   text;
  v_is_admin boolean;
  v_is_dir   boolean;
  v_can_rh   boolean;
  v_reason   text := nullif(btrim(coalesce(NEW.returned_reason, '')), '');
BEGIN
  -- service_role / psql / migrations: sem sessão de usuário, sem checagem.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    -- Sem mudança de status: ninguém carimba aprovação "de lado".
    NEW.approved_rh_at  := OLD.approved_rh_at;
    NEW.approved_rh_by  := OLD.approved_rh_by;
    NEW.approved_dir_at := OLD.approved_dir_at;
    NEW.approved_dir_by := OLD.approved_dir_by;
    NEW.returned_at     := OLD.returned_at;
    NEW.returned_by     := OLD.returned_by;
    NEW.returned_reason := OLD.returned_reason;
    RETURN NEW;
  END IF;

  v_action := public.payroll_period_transition_action(OLD.status, NEW.status);
  IF v_action IS NULL THEN
    RAISE EXCEPTION 'Essa mudança de status não existe no fluxo: % → %', OLD.status, NEW.status
      USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.is_admin_gc(auth.uid());
  v_is_dir   := v_is_admin OR EXISTS (
                  SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = auth.uid() AND ur.role::text = 'diretoria');
  v_can_rh   := v_is_admin
                OR public.has_module_permission(auth.uid(), NEW.company_id, 'financeiro', 'can_edit');

  -- Aprovar/devolver no nível da diretoria: só diretoria (ou admin_gc).
  IF v_action IN ('approve_diretoria', 'return_to_rh') AND NOT v_is_dir THEN
    RAISE EXCEPTION 'Só a diretoria pode aprovar ou devolver a folha nessa etapa';
  END IF;
  IF v_action = 'return_to_draft' AND OLD.status = 'aprovado_diretoria' AND NOT v_is_dir THEN
    RAISE EXCEPTION 'A folha já foi aprovada pela diretoria — só a diretoria devolve';
  END IF;
  IF NOT (v_can_rh OR v_is_dir) THEN
    RAISE EXCEPTION 'Você não tem permissão pra mudar o status da folha';
  END IF;

  -- Devolução SEMPRE tem motivo (é a transição pra trás — rastro obrigatório).
  IF v_action IN ('return_to_draft', 'return_to_rh')
     AND (v_reason IS NULL OR length(v_reason) < 5) THEN
    RAISE EXCEPTION 'Conta o motivo da devolução (mínimo 5 caracteres)';
  END IF;

  -- Carimbos (servidor, não client).
  NEW.approved_rh_at := CASE
    WHEN v_action = 'approve_rh' THEN now()
    WHEN NEW.status = 'open'     THEN NULL
    ELSE OLD.approved_rh_at END;
  NEW.approved_rh_by := CASE
    WHEN v_action = 'approve_rh' THEN auth.uid()
    WHEN NEW.status = 'open'     THEN NULL
    ELSE OLD.approved_rh_by END;

  NEW.approved_dir_at := CASE
    WHEN v_action = 'approve_diretoria'       THEN now()
    WHEN NEW.status IN ('open','aprovado_rh') THEN NULL
    ELSE OLD.approved_dir_at END;
  NEW.approved_dir_by := CASE
    WHEN v_action = 'approve_diretoria'       THEN auth.uid()
    WHEN NEW.status IN ('open','aprovado_rh') THEN NULL
    ELSE OLD.approved_dir_by END;

  IF v_action IN ('return_to_draft', 'return_to_rh') THEN
    NEW.returned_at     := now();
    NEW.returned_by     := auth.uid();
    NEW.returned_reason := v_reason;
  ELSE
    NEW.returned_at     := OLD.returned_at;
    NEW.returned_by     := OLD.returned_by;
    NEW.returned_reason := OLD.returned_reason;
  END IF;

  -- closed_*/exported_* também são server-authoritative: o closePeriod do client
  -- manda closed_by/closed_at no payload, e sem sobrescrever dava pra forjar
  -- quem fechou.
  IF v_action = 'close' THEN
    NEW.closed_at := now();
    NEW.closed_by := auth.uid();
  ELSIF v_action = 'export' THEN
    NEW.exported_at := now();
    NEW.exported_by := auth.uid();
  ELSIF v_action = 'reopen' THEN
    NEW.closed_at := NULL;
    NEW.closed_by := NULL;
    IF OLD.status = 'exported' THEN
      NEW.exported_at := NULL;
      NEW.exported_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_period_status_guard ON public.payroll_periods;
CREATE TRIGGER trg_payroll_period_status_guard
  BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_status_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Histórico — AFTER UPDATE em payroll_periods
--    No trigger (e não na RPC) pelo mesmo motivo: qualquer caminho de escrita
--    gera histórico, inclusive os botões Fechar/Reabrir que já existem.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_period_log_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_role   text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  v_action := coalesce(public.payroll_period_transition_action(OLD.status, NEW.status), 'other');

  v_role := CASE
    WHEN auth.uid() IS NULL THEN 'system'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = auth.uid() AND ur.role::text = 'diretoria') THEN 'diretoria'
    WHEN public.is_admin_gc(auth.uid()) THEN 'admin_gc'
    ELSE 'rh'
  END;

  INSERT INTO public.payroll_period_approvals (
    period_id, company_id, from_status, to_status, action, reason, actor_role, created_by
  ) VALUES (
    NEW.id, NEW.company_id, OLD.status, NEW.status, v_action,
    CASE WHEN v_action IN ('return_to_draft','return_to_rh') THEN NEW.returned_reason ELSE NULL END,
    v_role, auth.uid()
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_period_log_approval ON public.payroll_periods;
CREATE TRIGGER trg_payroll_period_log_approval
  AFTER UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_log_approval();

-- payroll_periods tinha DUAS audit triggers idênticas (audit_periods e
-- audit_payroll_periods) → cada aprovação geraria 2 linhas duplicadas no
-- audit_log. Removemos a duplicata; audit_payroll_periods continua.
DROP TRIGGER IF EXISTS audit_periods ON public.payroll_periods;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Triggers de payroll_period_notes
--    company_id e author_stage são DERIVADOS no servidor: o client não forja
--    empresa (o que furaria a RLS) nem se passa por diretoria.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_period_note_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_status  public.payroll_period_status;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.payroll_periods WHERE id = NEW.period_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Período da observação não existe';
  END IF;
  NEW.company_id := v_company;

  IF NEW.collaborator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.collaborators c
     WHERE c.id = NEW.collaborator_id AND c.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Esse colaborador não é da empresa do período';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
    NEW.period_status_at_note := v_status;
    -- admin_gc é master e pode anotar em nome de qualquer etapa; o resto é
    -- derivado do papel real.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_gc(auth.uid()) THEN
      NEW.author_stage := CASE
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid() AND ur.role::text = 'diretoria')
        THEN 'diretoria' ELSE 'rh' END;
    END IF;
  ELSE
    -- Imutáveis depois de criada (o conteúdo pode ser corrigido; a autoria não).
    NEW.period_id             := OLD.period_id;
    NEW.collaborator_id       := OLD.collaborator_id;
    NEW.author_stage          := OLD.author_stage;
    NEW.created_by            := OLD.created_by;
    NEW.period_status_at_note := OLD.period_status_at_note;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.is_resolved IS DISTINCT FROM OLD.is_resolved THEN
    NEW.resolved_at := CASE WHEN NEW.is_resolved THEN now() ELSE NULL END;
    NEW.resolved_by := CASE WHEN NEW.is_resolved THEN auth.uid() ELSE NULL END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_period_notes_defaults ON public.payroll_period_notes;
CREATE TRIGGER trg_payroll_period_notes_defaults
  BEFORE INSERT OR UPDATE ON public.payroll_period_notes
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_note_defaults();

-- PII: observação fala do pagamento de pessoa identificada.
DROP TRIGGER IF EXISTS audit_payroll_period_notes ON public.payroll_period_notes;
CREATE TRIGGER audit_payroll_period_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_period_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPCs (açúcar; a segurança está nos triggers)
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER de propósito: a RLS de payroll_periods continua valendo.
CREATE OR REPLACE FUNCTION public.set_payroll_period_status(
  p_period_id uuid,
  p_to_status public.payroll_period_status,
  p_reason    text DEFAULT NULL
)
RETURNS public.payroll_period_status
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new public.payroll_period_status;
BEGIN
  UPDATE public.payroll_periods
     SET status = p_to_status,
         returned_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = p_period_id
  RETURNING status INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Período não encontrado';
  END IF;
  RETURN v_new;
END;
$$;

-- RH marca a observação da diretoria como tratada (sem poder editar o texto de
-- outra pessoa — a policy de UPDATE só libera o autor).
CREATE OR REPLACE FUNCTION public.resolve_payroll_period_note(
  p_note_id  uuid,
  p_resolved boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.payroll_period_notes WHERE id = p_note_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observação não encontrada';
  END IF;
  IF NOT (public.is_admin_gc(auth.uid())
          OR public.has_module_permission(auth.uid(), v_company, 'financeiro', 'can_edit')) THEN
    RAISE EXCEPTION 'Sem permissão pra tratar observações da folha';
  END IF;

  UPDATE public.payroll_period_notes SET is_resolved = p_resolved WHERE id = p_note_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Exclusão de lançamento: destravar 'aprovado_rh'
--    A versão anterior barrava tudo que não fosse 'open' — com o fluxo novo isso
--    impediria o RH de corrigir a folha depois de conferir. Passa a usar a fonte
--    única de trava.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_payroll_entry_with_reason(p_entry_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid; v_year int; v_month int; v_audit_rows int;
  v_locked boolean;
  v_before jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  SELECT to_jsonb(pe), pe.company_id, pe.year, pe.month
    INTO v_before, v_company_id, v_year, v_month
    FROM public.payroll_entries pe WHERE pe.id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lancamento nao encontrado';
  END IF;
  IF NOT (public.is_admin_gc(auth.uid()) OR public.has_module_permission(auth.uid(), v_company_id, 'financeiro', 'can_delete')) THEN
    RAISE EXCEPTION 'Sem permissao para excluir lancamentos de folha';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Motivo da exclusao e obrigatorio (minimo 3 caracteres)';
  END IF;

  v_locked := public.payroll_period_is_locked(v_company_id, make_date(v_year, v_month, 1));
  IF coalesce(v_locked, false) THEN
    RAISE EXCEPTION 'Folha aprovada pela diretoria - devolva pra rascunho antes de excluir o lancamento';
  END IF;

  DELETE FROM public.payroll_entries WHERE id = p_entry_id;
  UPDATE public.audit_log SET after = jsonb_build_object('deletion_reason', v_reason)
   WHERE table_name = 'payroll_entries' AND action = 'delete' AND record_id = p_entry_id;
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  IF v_audit_rows = 0 THEN
    INSERT INTO public.audit_log (user_id, company_id, action, table_name, record_id, before, after)
    VALUES (auth.uid(), v_company_id, 'delete', 'payroll_entries', p_entry_id, v_before,
            jsonb_build_object('deletion_reason', v_reason));
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Trava no banco pra payroll_entries
--     Sem isso a trava é só de UI: o módulo Vale Transporte (WIP) faz upsert
--     direto em payroll_entries sem olhar o status do período.
--     Não vale pra service_role/jobs (auth.uid() NULL).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_entries_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid; v_year int; v_month int; v_locked boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_company := OLD.company_id; v_year := OLD.year; v_month := OLD.month;
  ELSE
    v_company := NEW.company_id; v_year := NEW.year; v_month := NEW.month;
  END IF;

  v_locked := public.payroll_period_is_locked(v_company, make_date(v_year, v_month, 1));
  IF coalesce(v_locked, false) THEN
    RAISE EXCEPTION 'A folha de %/% já foi aprovada pela diretoria — devolve pra rascunho antes de mexer nos lançamentos', v_month, v_year
      USING ERRCODE = '22023';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_entries_period_lock ON public.payroll_entries;
CREATE TRIGGER trg_payroll_entries_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.payroll_entries_period_lock();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RLS
--     Padrão de 20260622120000/20260626120000. Nota: aqui os args de
--     user_belongs_to_company vão na ORDEM CERTA (_user_id, _company_id) — as
--     policies antigas passam invertido e só funcionam porque 20260616120000
--     tornou a função tolerante à ordem.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_period_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_period_notes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gc reads all period approvals" ON public.payroll_period_approvals;
DROP POLICY IF EXISTS "company reads own period approvals" ON public.payroll_period_approvals;

-- Só leitura. Escrita é exclusiva do trigger (SECURITY DEFINER) — append-only.
CREATE POLICY "admin_gc reads all period approvals" ON public.payroll_period_approvals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "company reads own period approvals" ON public.payroll_period_approvals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador', 'diretoria'))
    AND public.user_belongs_to_company(auth.uid(), payroll_period_approvals.company_id)
  );

DROP POLICY IF EXISTS "admin_gc manages all payroll notes" ON public.payroll_period_notes;
DROP POLICY IF EXISTS "company reads own payroll notes"    ON public.payroll_period_notes;
DROP POLICY IF EXISTS "company writes own payroll notes"   ON public.payroll_period_notes;
DROP POLICY IF EXISTS "author updates own payroll notes"   ON public.payroll_period_notes;
DROP POLICY IF EXISTS "author deletes own payroll notes"   ON public.payroll_period_notes;

CREATE POLICY "admin_gc manages all payroll notes" ON public.payroll_period_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

CREATE POLICY "company reads own payroll notes" ON public.payroll_period_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador', 'diretoria'))
    AND public.user_belongs_to_company(auth.uid(), payroll_period_notes.company_id)
  );

-- company_id do WITH CHECK é o que o BEFORE trigger gravou (BR trigger roda
-- antes do WITH CHECK) — o client não escolhe a empresa.
CREATE POLICY "company writes own payroll notes" ON public.payroll_period_notes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'diretoria'))
    AND public.user_belongs_to_company(auth.uid(), payroll_period_notes.company_id)
  );

-- Corrigir/apagar: só quem escreveu (admin_gc já cobre pela policy FOR ALL).
CREATE POLICY "author updates own payroll notes" ON public.payroll_period_notes
  FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "author deletes own payroll notes" ON public.payroll_period_notes
  FOR DELETE USING (created_by = auth.uid());

-- Sem isso a diretoria não enxerga NADA: as policies abaixo são por lista de
-- role e o papel 'diretoria' não existia quando foram escritas.
DROP POLICY IF EXISTS "gestor_gc reads own periods" ON public.payroll_periods;
CREATE POLICY "gestor_gc reads own periods" ON public.payroll_periods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador', 'diretoria'))
    AND public.user_belongs_to_company(auth.uid(), payroll_periods.company_id)
  );

-- SEM ISTO A APROVAÇÃO NÃO FUNCIONA: a policy de ESCRITA de payroll_periods só
-- listava gestor_gc/rh. Um usuário só com papel 'diretoria' faria UPDATE que não
-- casa nenhuma policy → 0 linhas → "Período não encontrado", e o trigger guard
-- nem chegaria a rodar. Quem impede abuso continua sendo o guard, não a policy.
DROP POLICY IF EXISTS "gestor_gc writes own periods" ON public.payroll_periods;
CREATE POLICY "gestor_gc writes own periods" ON public.payroll_periods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'diretoria'))
    AND public.user_belongs_to_company(auth.uid(), payroll_periods.company_id)
  );

DROP POLICY IF EXISTS "gestor_gc reads own payments" ON public.payroll_payments;
CREATE POLICY "gestor_gc reads own payments" ON public.payroll_payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador', 'diretoria'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
       WHERE p.id = payroll_payments.period_id
         AND public.user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

DROP POLICY IF EXISTS "gestor_gc reads own reviews" ON public.payroll_collaborator_reviews;
CREATE POLICY "gestor_gc reads own reviews" ON public.payroll_collaborator_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador', 'diretoria'))
    AND EXISTS (
      SELECT 1 FROM public.payroll_periods p
       WHERE p.id = payroll_collaborator_reviews.period_id
         AND public.user_belongs_to_company(auth.uid(), p.company_id)
    )
  );

-- payroll_collaborator_reviews não tinha audit trigger, apesar de guardar
-- observação sobre a remuneração de pessoa identificada (CLAUDE.md: PII → audit).
DROP TRIGGER IF EXISTS audit_payroll_reviews ON public.payroll_collaborator_reviews;
CREATE TRIGGER audit_payroll_reviews
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_collaborator_reviews
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- payroll_entries e collaborators NÃO são por role, são por
-- has_module_permission → a diretoria enxerga lançamentos assim que receber
-- linhas em user_permissions (módulos 'financeiro'/'folha'/'colaboradores' com
-- can_view). Isso é DADO, não schema — fica fora da migration.

GRANT EXECUTE ON FUNCTION public.payroll_period_is_locked(public.payroll_period_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_period_is_locked(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_period_transition_action(public.payroll_period_status, public.payroll_period_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_payroll_period_status(uuid, public.payroll_period_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_payroll_period_note(uuid, boolean) TO authenticated;

COMMIT;

-- ROLLBACK
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_payroll_entries_period_lock ON public.payroll_entries;
--   DROP TRIGGER IF EXISTS trg_payroll_period_log_approval ON public.payroll_periods;
--   DROP TRIGGER IF EXISTS trg_payroll_period_status_guard ON public.payroll_periods;
--   DROP TRIGGER IF EXISTS audit_payroll_period_notes ON public.payroll_period_notes;
--   DROP TRIGGER IF EXISTS trg_payroll_period_notes_defaults ON public.payroll_period_notes;
--   DROP TRIGGER IF EXISTS audit_payroll_reviews ON public.payroll_collaborator_reviews;
--
--   DROP FUNCTION IF EXISTS public.resolve_payroll_period_note(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.set_payroll_period_status(uuid, public.payroll_period_status, text);
--   DROP FUNCTION IF EXISTS public.payroll_entries_period_lock();
--   DROP FUNCTION IF EXISTS public.payroll_period_note_defaults();
--   DROP FUNCTION IF EXISTS public.payroll_period_log_approval();
--   DROP FUNCTION IF EXISTS public.payroll_period_status_guard();
--   DROP FUNCTION IF EXISTS public.payroll_period_transition_action(public.payroll_period_status, public.payroll_period_status);
--   DROP FUNCTION IF EXISTS public.payroll_period_is_locked(uuid, date);
--   DROP FUNCTION IF EXISTS public.payroll_period_is_locked(public.payroll_period_status);
--
--   DROP TABLE IF EXISTS public.payroll_period_notes;
--   DROP TABLE IF EXISTS public.payroll_period_approvals;
--
--   ALTER TABLE public.payroll_periods
--     DROP COLUMN IF EXISTS approved_rh_at,  DROP COLUMN IF EXISTS approved_rh_by,
--     DROP COLUMN IF EXISTS approved_dir_at, DROP COLUMN IF EXISTS approved_dir_by,
--     DROP COLUMN IF EXISTS returned_at,     DROP COLUMN IF EXISTS returned_by,
--     DROP COLUMN IF EXISTS returned_reason;
--   DROP INDEX IF EXISTS public.idx_periods_pending_diretoria;
--
--   -- audit trigger duplicada que removemos:
--   CREATE TRIGGER audit_periods AFTER INSERT OR UPDATE OR DELETE ON public.payroll_periods
--     FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
--
--   -- delete_payroll_entry_with_reason volta a barrar tudo que não for 'open':
--   --   SELECT status INTO v_status FROM public.payroll_periods
--   --    WHERE company_id = v_company_id AND reference_month = make_date(v_year, v_month, 1);
--   --   IF v_status IS NOT NULL AND v_status <> 'open' THEN
--   --     RAISE EXCEPTION 'Periodo fechado - reabra antes de excluir o lancamento';
--   --   END IF;
--
--   -- policies sem 'diretoria' (recriar exatamente como estavam):
--   DROP POLICY IF EXISTS "gestor_gc writes own periods" ON public.payroll_periods;
--   CREATE POLICY "gestor_gc writes own periods" ON public.payroll_periods
--     FOR ALL USING (
--       EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
--               AND ur.role::text IN ('gestor_gc','rh'))
--       AND public.user_belongs_to_company(auth.uid(), payroll_periods.company_id)
--     );
--   -- idem "gestor_gc reads own periods" / "gestor_gc reads own payments" /
--   -- "gestor_gc reads own reviews" — sem 'diretoria' na lista.
-- COMMIT;
--
-- Os labels de enum criados em 20260727120000 NÃO são removidos aqui
-- (Postgres não tem DROP VALUE) — ver o rollback daquele arquivo.
