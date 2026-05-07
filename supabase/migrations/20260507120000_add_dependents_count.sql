-- Adiciona contagem de dependentes legais por colaborador.
-- Usado pelo cálculo de IRPF mensal (R$ 189,59 de dedução por dependente
-- conforme tabela 2026). Ver src/lib/payroll/cltCalc.ts.

ALTER TABLE collaborators
  ADD COLUMN dependents_count integer NOT NULL DEFAULT 0
    CHECK (dependents_count >= 0 AND dependents_count <= 30);

COMMENT ON COLUMN collaborators.dependents_count IS
  'Quantidade de dependentes legais para cálculo de IRPF (Lei 9.250/95). '
  'Cada dependente reduz R$ 189,59 da base de cálculo do IRPF mensal.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (não executar a menos que precise reverter):
-- ALTER TABLE collaborators DROP COLUMN dependents_count;
-- ─────────────────────────────────────────────────────────────────────────────
