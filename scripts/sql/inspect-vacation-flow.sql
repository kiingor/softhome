-- ─────────────────────────────────────────────────────────────────────────────
-- Inspetor do Fluxo de Férias — colabs 384 e 816 (sync-collaborators)
--
-- Rode no Supabase Studio > SQL Editor APÓS executar manualmente o teste:
--   1. Solicitar férias dos 2 colabs (UI)
--   2. Aprovar as 2 solicitações
--   3. Abrir folha do mês do gozo
--   4. Abrir folha do mês SEGUINTE ao gozo (deveria pular os colabs)
--   5. (Opcional) Adiantar 1 férias e re-conferir
--
-- Cada query reporta uma asserção de negócio. Resultado esperado vai como
-- comentário no fim de cada bloco. Vermelho = bug.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Localizar os 2 colabs de teste por external_id da agenda ──
-- (TEST_ONLY_COLAB_IDS = [384, 816] na sync)
SELECT
  id, name, current_salary, dependents_count, status,
  external_id, store_id
FROM collaborators
WHERE external_id IN ('384', '816')
ORDER BY external_id;
-- Esperado: 2 linhas, ambas status='ativo', current_salary preenchido

-- ── 2. Vacation requests aprovadas dos 2 colabs (snapshot + payroll_month) ──
SELECT
  vr.id AS request_id,
  c.name,
  c.external_id AS colab_ext_id,
  vr.start_date,
  vr.end_date,
  vr.days_count,
  vr.sell_days,
  vr.gratifications,
  vr.bonifications,
  vr.payment_date,
  vr.payroll_month,
  vr.payroll_year,
  vr.posted_to_payroll,
  jsonb_array_length(coalesce(vr.payroll_entry_ids::jsonb, '[]'::jsonb)) AS num_entry_ids,
  vr.calculation_snapshot->'valor_ferias'        AS calc_valor_ferias,
  vr.calculation_snapshot->'gratificacao_valor'  AS calc_grat_valor,
  vr.calculation_snapshot->'um_terco_ferias'     AS calc_um_terco,
  vr.calculation_snapshot->'valor_bonificacao'   AS calc_boni,
  vr.calculation_snapshot->'base_inss'           AS calc_base_inss,
  vr.calculation_snapshot->'inss'                AS calc_inss,
  vr.calculation_snapshot->'irrf'                AS calc_irrf,
  vr.calculation_snapshot->'bruto'               AS calc_bruto,
  vr.calculation_snapshot->'liquido'             AS calc_liquido
FROM vacation_requests vr
JOIN collaborators c ON c.id = vr.collaborator_id
WHERE c.external_id IN ('384', '816')
  AND vr.status = 'approved'
ORDER BY c.external_id, vr.start_date DESC;
-- Esperado:
--   • payroll_month/year = mês/ano do start_date (gozo)
--   • posted_to_payroll = true (se folha do mês existe e está aberta)
--   • calc_valor_ferias = SÓ salário × dias/30 (sem grat embutida)
--   • calc_grat_valor = grat × dias/30 (linha SEPARADA)
--   • calc_bruto = valor_ferias + grat_valor + 1/3 + abono + 1/3_abono + boni

-- ── 3. Payroll entries de férias dos 2 colabs (todas as 4-8 linhas) ──
SELECT
  pe.month, pe.year,
  c.name, c.external_id AS colab_ext_id,
  pe.type,
  pe.description,
  pe.value,
  pe.external_id,
  pe.is_fixed
FROM payroll_entries pe
JOIN collaborators c ON c.id = pe.collaborator_id
WHERE c.external_id IN ('384', '816')
  AND pe.external_id LIKE 'ferias-%'
ORDER BY c.external_id, pe.year DESC, pe.month DESC, pe.type;
-- Esperado por colab (em 1 mês):
--   ferias provento    (valor_ferias só salário)
--   ferias terco
--   gratificacao       (grat proporcional, se houver) ← NOVA linha
--   bonificacao        (boni, se houver)
--   ferias abono       (se vendeu dias)
--   ferias terco-abono (se vendeu dias)
--   inss
--   irpf

-- ── 4. CONFERÊNCIA: soma das rows == calc.bruto e descontos ──
-- Bug histórico: soma diferia em 1 grat (dupla-contagem visual)
SELECT
  c.name,
  c.external_id AS colab_ext_id,
  pe.month, pe.year,
  ROUND(SUM(CASE WHEN pe.type IN ('ferias','gratificacao','bonificacao') THEN pe.value ELSE 0 END)::numeric, 2) AS soma_proventos,
  ROUND(SUM(CASE WHEN pe.type IN ('inss','irpf') THEN pe.value ELSE 0 END)::numeric, 2) AS soma_descontos,
  vr.calculation_snapshot->'bruto'   AS snap_bruto,
  vr.calculation_snapshot->'inss'    AS snap_inss,
  vr.calculation_snapshot->'irrf'    AS snap_irrf,
  vr.calculation_snapshot->'liquido' AS snap_liquido
FROM payroll_entries pe
JOIN collaborators c ON c.id = pe.collaborator_id
LEFT JOIN vacation_requests vr ON vr.id::text = REGEXP_REPLACE(pe.external_id, '^ferias-([^-]+)-.*$', '\1')
WHERE c.external_id IN ('384', '816')
  AND pe.external_id LIKE 'ferias-%'
GROUP BY c.name, c.external_id, pe.month, pe.year, vr.calculation_snapshot
ORDER BY c.external_id, pe.year DESC, pe.month DESC;
-- Esperado: soma_proventos = snap_bruto (sem dupla contagem)
--          soma_descontos = snap_inss + snap_irrf

-- ── 5. Skip mês-seguinte: folha do mês posterior ao gozo deve estar VAZIA p/ esses colabs ──
-- Substitua $MONTH e $YEAR pelo MÊS SEGUINTE ao gozo (ex: gozo Ago → MONTH=9, YEAR=2026)
WITH next_month_skips AS (
  SELECT DISTINCT vr.collaborator_id
  FROM vacation_requests vr
  WHERE vr.status = 'approved'
    AND vr.payroll_month = $MONTH - 1   -- ajuste se for Janeiro
    AND vr.payroll_year  = $YEAR
)
SELECT
  c.name,
  c.external_id,
  COUNT(pe.id) AS num_entries_in_next_month,
  STRING_AGG(DISTINCT pe.type, ', ' ORDER BY pe.type) AS entry_types
FROM collaborators c
LEFT JOIN payroll_entries pe ON pe.collaborator_id = c.id
  AND pe.month = $MONTH AND pe.year = $YEAR
WHERE c.id IN (SELECT collaborator_id FROM next_month_skips)
GROUP BY c.id, c.name, c.external_id
ORDER BY c.external_id;
-- Esperado: num_entries_in_next_month = 0 (colab pulado completamente).
-- Se vier salario_base / inss / irpf / fgts / gratificacao → BUG do skip-rule.

-- ── 6. Adiantamento: verifica se payroll_month foi atualizado e end_date NÃO ──
-- (se vc adiantou alguma férias pelo botão "Adiantar Férias")
SELECT
  c.name,
  c.external_id,
  vr.start_date,
  vr.end_date,
  vr.payroll_month   AS recibo_mes,
  vr.payroll_year    AS recibo_ano,
  EXTRACT(MONTH FROM vr.start_date::date) AS gozo_mes_inicio,
  CASE
    WHEN vr.payroll_month = EXTRACT(MONTH FROM vr.start_date::date) THEN 'normal'
    ELSE 'ADIANTADO (recibo ≠ início)'
  END AS adiantamento
FROM vacation_requests vr
JOIN collaborators c ON c.id = vr.collaborator_id
WHERE c.external_id IN ('384', '816')
  AND vr.status = 'approved'
ORDER BY c.external_id, vr.start_date DESC;
-- Esperado: se ADIANTADO, recibo_mes ≠ mês do start_date.
-- Pra esse colab, a folha do mês SEGUINTE ao recibo (não ao gozo!) deve pular.

-- ── 7. Folha do mês do gozo: salário NORMAL + recibo ambos lançados ──
-- Substitua $MONTH / $YEAR pelo MÊS DO GOZO (start_date)
SELECT
  c.name,
  c.external_id,
  pe.type,
  pe.description,
  pe.value,
  pe.external_id IS NOT NULL AS tem_external_id,
  CASE
    WHEN pe.external_id LIKE 'ferias-%'    THEN 'RECIBO DE FÉRIAS'
    WHEN pe.external_id = 'salario-base'   THEN 'SALÁRIO BASE (sync)'
    WHEN pe.external_id IN ('inss-base','irpf-base','fgts-base') THEN 'ENCARGO (sync)'
    WHEN pe.external_id IS NULL            THEN 'auto-populate / manual'
    ELSE 'sync agenda'
  END AS origem
FROM payroll_entries pe
JOIN collaborators c ON c.id = pe.collaborator_id
WHERE c.external_id IN ('384', '816')
  AND pe.month = $MONTH AND pe.year = $YEAR
ORDER BY c.external_id, origem, pe.type;
-- Esperado: mês do gozo tem AMBOS salário base + recibo de férias.

-- ── 8. Sanity: existe alguma linha 'gratificacao' do recibo com valor IGUAL à grat da request? ──
-- (verifica se a proporcionalidade dos dias está sendo aplicada — bug antigo
-- dava value = grat inteira em vez de proporcional)
SELECT
  c.name,
  c.external_id,
  vr.days_count,
  vr.gratifications AS grat_input,
  pe.value          AS grat_linha_recibo,
  ROUND((vr.gratifications * vr.days_count / 30.0)::numeric, 2) AS grat_proporcional_esperada,
  CASE
    WHEN ABS(pe.value - (vr.gratifications * vr.days_count / 30.0)) <= 0.01 THEN '✓ OK'
    ELSE '✗ NÃO PROPORCIONAL — bug'
  END AS conferencia
FROM payroll_entries pe
JOIN collaborators c ON c.id = pe.collaborator_id
JOIN vacation_requests vr ON vr.id::text = REGEXP_REPLACE(pe.external_id, '^ferias-([^-]+)-gratificacao$', '\1')
WHERE c.external_id IN ('384', '816')
  AND pe.external_id LIKE 'ferias-%-gratificacao'
ORDER BY c.external_id;
-- Esperado: todas as linhas com '✓ OK'.

-- ── 9. Reset rápido pra testar de novo (DESTRUTIVO — só rode se tiver certeza) ──
-- DESCOMENTE as 3 linhas abaixo pra apagar testes e recomeçar:
--
-- DELETE FROM payroll_entries WHERE collaborator_id IN
--   (SELECT id FROM collaborators WHERE external_id IN ('384','816'))
--   AND external_id LIKE 'ferias-%';
-- DELETE FROM vacation_requests WHERE collaborator_id IN
--   (SELECT id FROM collaborators WHERE external_id IN ('384','816'))
--   AND status = 'approved';
-- -- (Periodos de folha vc apaga pela UI mesmo)
