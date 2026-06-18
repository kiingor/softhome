-- Migration: 20260618120000_create_collaborator_fixed_entries.sql
-- Description: cria a "ficha fixa" de lançamentos recorrentes do colaborador.
--
-- Problema que resolve: lançamentos manuais recorrentes (ex.: Carro Agregado,
-- descontos fixos) viviam SOLTOS em payroll_entries, um registro por competência
-- (month/year). O cadastro do colaborador só mostra a competência corrente, então
-- um lançamento criado pra outro mês "sumia" da vista — mesmo existindo na folha.
-- Resultado: o RH recadastrava achando que falhou, gerando duplicatas na folha.
--
-- Solução: itens fixos passam a ser propriedade PERMANENTE do colaborador (esta
-- tabela), independente de mês. A folha materializa esses itens em payroll_entries
-- sob demanda (openPeriod / repopulatePeriod), idempotente por
-- external_id = 'fixed-<id>-<YYYY-MM>'. Mesmo padrão já usado por salário-família
-- e Vale Transporte. Só competências ABERTAS/futuras são afetadas; fechadas ficam.
--
-- LGPD: contém `value` (PII financeira) → audit trigger + RLS por company_id.
--
-- Sistema EM OPERAÇÃO: antes de qualquer coisa, faz BACKUP completo das entries
-- fixas manuais soltas hoje (rollback fácil se precisar voltar).

BEGIN;

-- ============================================================
-- 1. BACKUP dos lançamentos fixos manuais existentes
-- ============================================================
-- Snapshot imutável das entries que vão "virar" ficha fixa. Não apagamos nada de
-- payroll_entries nesta migration — o backup é só rede de segurança pra rollback.
-- Filtro: marcadas como recorrentes (is_fixed), locais (external_id NULL — não
-- vieram da agenda nem são derivadas de salário/encargo/benefício) e de tipos
-- manuais (exclui salário base, INSS/IRPF/FGTS, benefício, férias, salário-família
-- e legados custo/despesa/vale/adicional).
CREATE TABLE public.payroll_entries_fixed_backup_20260618 AS
SELECT *
FROM public.payroll_entries
WHERE is_fixed = true
  AND external_id IS NULL
  AND type::text NOT IN (
    'salario_base', 'salario', 'beneficio', 'inss', 'irpf', 'fgts',
    'ferias', 'salario_familia', 'custo', 'despesa', 'vale', 'adicional'
  );

-- Backup também tem PII → tranca. RLS sem policy de leitura pública: só
-- service_role/superuser (e admin_gc, abaixo) enxergam.
ALTER TABLE public.payroll_entries_fixed_backup_20260618 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_gc reads fixed backup"
  ON public.payroll_entries_fixed_backup_20260618 FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

-- ============================================================
-- 2. Tabela collaborator_fixed_entries (ficha fixa)
-- ============================================================
CREATE TABLE public.collaborator_fixed_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  type public.payroll_entry_type NOT NULL,
  description text,
  value numeric(12, 2) NOT NULL CHECK (value > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Materialização lê por colaborador ativo; cadastro lê por colaborador.
CREATE INDEX idx_fixed_entries_collaborator
  ON public.collaborator_fixed_entries(collaborator_id);
CREATE INDEX idx_fixed_entries_company
  ON public.collaborator_fixed_entries(company_id);

-- Guarda anti-duplicata (a dor do usuário): no máximo 1 item ATIVO por
-- colaborador + tipo + descrição (case-insensitive, NULL tratado como '').
CREATE UNIQUE INDEX uq_fixed_entries_active
  ON public.collaborator_fixed_entries
     (collaborator_id, type, (coalesce(lower(description), '')))
  WHERE is_active;

CREATE TRIGGER set_updated_at_fixed_entries
  BEFORE UPDATE ON public.collaborator_fixed_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- PII (value) → audit trail obrigatório (CLAUDE.md princípio 1).
CREATE TRIGGER audit_fixed_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.collaborator_fixed_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ============================================================
-- 3. RLS — mesmo padrão de payroll_periods (módulo Folha)
-- ============================================================
ALTER TABLE public.collaborator_fixed_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gc reads all fixed entries"
  ON public.collaborator_fixed_entries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc reads own fixed entries"
  ON public.collaborator_fixed_entries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh', 'contador'))
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );
CREATE POLICY "admin_gc writes fixed entries"
  ON public.collaborator_fixed_entries FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );
CREATE POLICY "gestor_gc writes own fixed entries"
  ON public.collaborator_fixed_entries FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('gestor_gc', 'rh'))
    AND public.user_belongs_to_company(auth.uid(), company_id)
  );

-- ============================================================
-- 4. Migração de dados: solto → ficha fixa (deduplicado)
-- ============================================================
-- Um item fixo aparece N vezes (uma por mês, via carry-over). Colapsa pra 1
-- linha por (colaborador, tipo, descrição), pegando o valor da competência MAIS
-- RECENTE como verdade atual. Histórico em payroll_entries fica intocado.
INSERT INTO public.collaborator_fixed_entries
  (company_id, collaborator_id, type, description, value, is_active, created_by, created_at)
SELECT DISTINCT ON (pe.collaborator_id, pe.type, coalesce(lower(pe.description), ''))
  pe.company_id,
  pe.collaborator_id,
  pe.type,
  pe.description,
  pe.value,
  true,
  pe.created_by,
  now()
FROM public.payroll_entries pe
WHERE pe.is_fixed = true
  AND pe.external_id IS NULL
  AND pe.type::text NOT IN (
    'salario_base', 'salario', 'beneficio', 'inss', 'irpf', 'fgts',
    'ferias', 'salario_familia', 'custo', 'despesa', 'vale', 'adicional'
  )
ORDER BY
  pe.collaborator_id,
  pe.type,
  coalesce(lower(pe.description), ''),
  pe.year DESC,
  pe.month DESC,
  pe.created_at DESC;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
--   DROP TABLE IF EXISTS public.collaborator_fixed_entries CASCADE;
--   -- Backup preservado pra inspeção; descomente pra remover também:
--   -- DROP TABLE IF EXISTS public.payroll_entries_fixed_backup_20260618 CASCADE;
-- COMMIT;
--
-- Obs.: esta migration é puramente ADITIVA — não alterou nem apagou linhas de
-- payroll_entries. Reverter = só dropar a tabela nova. O backup
-- payroll_entries_fixed_backup_20260618 guarda o estado das entries soltas
-- caso uma limpeza futura (na materialização) precise ser desfeita.
