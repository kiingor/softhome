-- Migration: 20260818120100_payroll_payable_lines.sql
-- Description: congela, na aprovação da diretoria, EXATAMENTE quanto cada
--   colaborador recebe naquela folha.
--
-- POR QUE ISSO EXISTE
-- Até aqui o líquido de cada pessoa só existia no navegador: a conta vivia num
-- useMemo do PaymentsTab e depois foi extraída pra
-- src/modules/payroll/lib/buildPaymentLines.ts. O servidor NÃO sabia quanto
-- pagar a ninguém — o que é aceitável enquanto o pagamento é manual e
-- inaceitável no momento em que alguém (edge function, job, integração PIX)
-- precisar mandar valor pro banco. Valor de pagamento é irreversível: ele tem
-- que sair de um número congelado, com trilha, e não de um recálculo que
-- depende de qual aba estava aberta.
--
-- ORÁCULO: src/modules/payroll/lib/buildPaymentLines.ts (+ o .test.ts ao lado).
-- Este SQL é a TRADUÇÃO daquela função, caso a caso. Enquanto os dois
-- existirem, mudar regra em um sem mudar no outro produz PIX errado — a mesma
-- dívida que o repo já carrega em _shared/clt-calc.ts. Se divergirem, o TS
-- manda até o cutover; depois do cutover, este arquivo passa a mandar.
--
-- LGPD (CLAUDE.md princípio 1): a tabela guarda remuneração de pessoa
-- identificada → PII → audit_log_trigger anexada, e company_id denormalizado
-- pra que a linha do audit_log tenha empresa (senão só admin_gc enxerga o log).
--
-- CLAUDE.md princípio 3: nada aqui escreve sozinho. O gatilho é a aprovação
-- HUMANA da diretoria; o builder só materializa o que ela aprovou.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Constantes do módulo, espelhadas do TypeScript
--    Ficam como função IMMUTABLE (e não como CASE solto no meio do builder) pra
--    que a próxima atualização anual/alteração de rótulo tenha UM lugar pra
--    mexer, igual ao que ../types.ts é pro front.
-- ─────────────────────────────────────────────────────────────────────────────

-- Espelho de ENTRY_TYPE_LABELS + labelOf(): a descrição escrita pelo RH ganha
-- do rótulo padrão (é onde ele conta o motivo do lançamento), e tipo
-- desconhecido cai no próprio nome do tipo em vez de virar NULL.
-- SET search_path = public por uniformidade com as funções de 20260818120000:
-- ninguém chama isto com search_path hostil hoje, mas função que compõe rótulo
-- de dinheiro não pode depender do search_path de quem chama.
CREATE OR REPLACE FUNCTION public.payroll_entry_label(p_type text, p_description text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    p_description,
    CASE p_type
      WHEN 'salario_base'            THEN 'Salário base'
      WHEN 'salario_retroativo'      THEN 'Salário Retroativo'
      WHEN 'hora_extra'              THEN 'Hora extra'
      WHEN 'falta'                   THEN 'Falta'
      WHEN 'atestado'                THEN 'Atestado'
      WHEN 'beneficio'               THEN 'Benefício'
      WHEN 'adiantamento'            THEN 'Adiantamento'
      WHEN 'bonificacao'             THEN 'Bonificação'
      WHEN 'gratificacao'            THEN 'Gratificação'
      WHEN 'carro_agregado'          THEN 'Carro Agregado'
      WHEN 'periculosidade'          THEN 'Periculosidade'
      WHEN 'auxilio_vale_transporte' THEN 'Auxílio Vale Transporte'
      WHEN 'desconto'                THEN 'Desconto'
      WHEN 'emprestimo'              THEN 'Empréstimo'
      WHEN 'ferias'                  THEN 'Férias'
      WHEN 'salario_familia'         THEN 'Salário-Família'
      WHEN 'custo'                   THEN 'Custo (legacy)'
      WHEN 'despesa'                 THEN 'Despesa (legacy)'
      WHEN 'inss'                    THEN 'INSS'
      WHEN 'fgts'                    THEN 'FGTS'
      WHEN 'irpf'                    THEN 'IRPF'
    END,
    p_type
  );
$$;

-- Espelho de MONTHLY_MERGED_TYPES. O número É a ordem de exibição dos
-- componentes (salário primeiro, adicionais depois) e também a ordem que decide
-- a âncora quando não existe salário base. NULL = não entra na mescla mensal.
CREATE OR REPLACE FUNCTION public.payroll_monthly_merged_rank(p_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'salario_base'    THEN 1
    WHEN 'gratificacao'    THEN 2
    WHEN 'hora_extra'      THEN 3
    WHEN 'periculosidade'  THEN 4
    WHEN 'salario_familia' THEN 5
  END;
$$;

COMMENT ON FUNCTION public.payroll_entry_label(text, text) IS
  'Espelho de ENTRY_TYPE_LABELS/labelOf() de src/modules/payroll. Mudou lá, muda aqui.';
COMMENT ON FUNCTION public.payroll_monthly_merged_rank(text) IS
  'Espelho de MONTHLY_MERGED_TYPES: posição na mescla mensal = ordem de exibição. NULL = linha avulsa.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. payroll_payable_lines — o congelado
--
--    Uma linha = um pagamento (um PIX). Não é "um lançamento": o mensal soma
--    salário + adicionais, e o cheque de férias é outro pagamento da mesma
--    pessoa no mesmo mês.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_payable_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT (e não CASCADE) pelo mesmo motivo que payroll_pix_transfers usa
  -- RESTRICT em period_id: apagar um período que já tem valor congelado — e
  -- possivelmente PIX enviado — não pode levar o congelado junto em silêncio.
  -- Quem quiser apagar o período limpa as linhas antes, de forma explícita.
  period_id         uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
  -- Denormalizado: é o que dá empresa pro audit_log e o que a RLS filtra sem
  -- precisar de join com payroll_periods a cada SELECT.
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- RESTRICT: quem já tem valor congelado (e possivelmente pago) não some do
  -- cadastro por acidente.
  collaborator_id   uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE RESTRICT,

  -- ÂNCORA. É o lançamento que identifica o pagamento — o mesmo id que
  -- payroll_payments.entry_id usa pra marcar "pago". RESTRICT porque apagar o
  -- lançamento que originou um pagamento congelado deixaria o dinheiro sem
  -- origem: se for pra mexer, primeiro a folha volta pra rascunho e as linhas
  -- são regeradas.
  entry_id          uuid NOT NULL REFERENCES public.payroll_entries(id) ON DELETE RESTRICT,

  kind              text NOT NULL CHECK (kind IN ('mensal', 'ferias', 'avulso')),

  gross             numeric(12,2) NOT NULL,
  inss              numeric(12,2) NOT NULL DEFAULT 0,
  irpf              numeric(12,2) NOT NULL DEFAULT 0,
  -- Débitos manuais (falta, adiantamento, desconto, empréstimo).
  other_deductions  numeric(12,2) NOT NULL DEFAULT 0,
  -- gross - inss - irpf - other_deductions. O CHECK é a última barreira do
  -- clamp: pagamento de zero ou negativo não existe (ver comentário do builder).
  net_amount        numeric(12,2) NOT NULL CHECK (net_amount > 0),

  -- [{entryId, type, label, value}] na ordem de exibição. É a prestação de
  -- contas da linha: sem isso, "R$ 3.300,00" não se explica seis meses depois.
  -- Chave em camelCase de propósito: é o mesmo shape que
  -- src/modules/payroll/lib/buildPaymentLines.ts entrega e que a UI já consome,
  -- então o cutover troca a fonte do dado sem tocar no componente.
  components        jsonb NOT NULL,

  -- [{label, value}] dos débitos manuais que formaram other_deductions. O total
  -- sozinho não basta: o popup de detalhe da tela de pagamentos mostra desconto
  -- a desconto ("− Plano de saúde  R$ 150"), e quando essa tela passar a ler do
  -- banco em vez de recalcular no navegador, esses rótulos precisam existir aqui
  -- — senão o congelado explica o líquido pela metade.
  discounts         jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ─── SNAPSHOT DO FAVORECIDO ────────────────────────────────────────────
  -- Congelado junto com o valor, e pelo mesmo motivo: o congelamento existe pra
  -- que o VALOR **e o DESTINATÁRIO** sejam decididos no instante em que a
  -- diretoria aprova, não no instante em que alguém clica em Pagar. Sem isto, a
  -- chave PIX poderia mudar entre a aprovação e o pagamento sem deixar rastro —
  -- e o comprovante apontaria para um destino que ninguém aprovou.
  --
  -- Nullable de propósito (menos o nome): a sync do ERP cria colaborador sem
  -- PIX e sem CPF. Quem barra o pagamento é payroll_pix_open_transfer, com
  -- mensagem clara, não um NOT NULL que quebraria o congelamento da folha
  -- inteira por causa de um cadastro incompleto.
  payee_name         text NOT NULL,
  payee_document     text,
  payee_pix_key      text,
  payee_pix_key_norm text,
  payee_pix_key_type public.pix_key_type,

  -- Pensão alimentícia vigente no mês: o valor congelado aqui é o líquido CLT,
  -- SEM a retenção judicial. Marcamos a linha pra que nenhum fluxo automático
  -- de PIX pague o valor cheio a quem tem desconto determinado por juiz.
  has_alimony_block boolean NOT NULL DEFAULT false,

  built_at          timestamptz NOT NULL DEFAULT now(),
  -- Status da folha no instante do congelamento. Normalmente
  -- 'aprovado_diretoria'; se algum dia sair diferente, é sinal de execução
  -- manual do builder e a trilha registra isso.
  built_from_status public.payroll_period_status NOT NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- CONSTRAINT (e não índice parcial): é o alvo natural de ON CONFLICT pro dia
  -- em que alguém quiser upsert em vez de DELETE+INSERT — a armadilha do
  -- supabase-js está documentada em 20260518182932.
  CONSTRAINT payroll_payable_lines_period_entry_uk UNIQUE (period_id, entry_id),

  -- Unicidade GLOBAL por lançamento, e não só dentro do período. Sem ela, o
  -- `SELECT ... INTO v_line WHERE entry_id = p_entry_id` de
  -- payroll_pix_open_transfer (migration 20260818120200) escolheria UMA linha
  -- arbitrária em silêncio caso o mesmo lançamento aparecesse em dois períodos
  -- — numa função que decide valor e destinatário de PIX. Alinha com o
  -- UNIQUE (entry_id) que payroll_payments já tem: um lançamento origina um
  -- pagamento, ponto.
  CONSTRAINT payroll_payable_lines_entry_uk UNIQUE (entry_id)
);

COMMENT ON TABLE public.payroll_payable_lines IS
  'Quanto cada colaborador recebe na folha aprovada. Congelado pelo builder na aprovação da diretoria. Espelho SQL de src/modules/payroll/lib/buildPaymentLines.ts. Escrita só pelo builder (SECURITY DEFINER) — não há policy de INSERT/UPDATE/DELETE.';
COMMENT ON COLUMN public.payroll_payable_lines.entry_id IS
  'Lançamento âncora do pagamento (mesmo id usado em payroll_payments.entry_id). No mensal é o salário base quando existe.';
COMMENT ON COLUMN public.payroll_payable_lines.components IS
  'Array [{entryId, type, label, value}] na ordem de exibição — o detalhamento que justifica o amount. Chaves em camelCase, iguais às de buildPaymentLines.ts.';
COMMENT ON COLUMN public.payroll_payable_lines.discounts IS
  'Array [{label, value}] dos débitos manuais somados em other_deductions — o que o popup de detalhe da tela de pagamentos lista item a item. Vazio nas linhas de férias e avulsas, que não sofrem desconto manual.';
COMMENT ON COLUMN public.payroll_payable_lines.has_alimony_block IS
  'Colaborador com ordem judicial de pensão vigente no mês: o amount NÃO desconta a pensão, então pagamento automático fica bloqueado.';

CREATE INDEX IF NOT EXISTS idx_payable_lines_period
  ON public.payroll_payable_lines (period_id);
CREATE INDEX IF NOT EXISTS idx_payable_lines_collaborator
  ON public.payroll_payable_lines (collaborator_id, period_id);
CREATE INDEX IF NOT EXISTS idx_payable_lines_company
  ON public.payroll_payable_lines (company_id, built_at DESC);
-- Fila de conferência: "quem não pode receber automático nesta folha".
CREATE INDEX IF NOT EXISTS idx_payable_lines_alimony
  ON public.payroll_payable_lines (period_id)
  WHERE has_alimony_block = true;

DROP TRIGGER IF EXISTS set_updated_at_payable_lines ON public.payroll_payable_lines;
CREATE TRIGGER set_updated_at_payable_lines
  BEFORE UPDATE ON public.payroll_payable_lines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- PII: valor pago a pessoa identificada.
DROP TRIGGER IF EXISTS audit_payroll_payable_lines ON public.payroll_payable_lines;
CREATE TRIGGER audit_payroll_payable_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_payable_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O builder — tradução de buildPaymentLines()
--
--    Regras que NÃO podem se perder (cada uma tem caso no .test.ts):
--      a) só proventos (EARNINGS_TYPES). 'beneficio' só com is_payable = true;
--         os demais benefícios são voucher/serviço, pagos por outro fluxo. FGTS
--         fica de fora por ser encargo do empregador — nunca sai do salário.
--      b) estorno: soma por (colaborador, tipo); saldo <= 0 derruba o grupo
--         INTEIRO, e dentro do grupo sobrevivente só entra o que é > 0.
--      c) férias é um pagamento SEPARADO (CLT art. 145): o que define é o
--         prefixo 'ferias-' do external_id, e o mesmo prefixo separa o
--         INSS/IRRF de férias do INSS/IRPF do mês.
--      d) débito manual (falta, adiantamento, desconto, empréstimo) só reduz o
--         MENSAL. Nunca o cheque de férias.
--      e) mescla mensal numa linha só; fora dela, cada tipo vira 'avulso' SEM
--         imposto e SEM desconto — os do mês já foram consumidos pelo mensal, e
--         descontar de novo pagaria a menos.
--      f) clamp: linha com amount <= 0 não vira pagamento.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_build_payable_lines(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company    uuid;
  v_ref        date;
  v_status     public.payroll_period_status;
  v_month      int;
  v_year       int;
  v_month_end  date;
  v_pending    bigint;
  v_rows       int;
BEGIN
  SELECT company_id, reference_month, status
    INTO v_company, v_ref, v_status
    FROM public.payroll_periods
   WHERE id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Folha não encontrada';
  END IF;

  -- ── O congelamento é CONSEQUÊNCIA da aprovação, nunca a causa dela ──────
  -- Sem esta trava, quem opera a folha fabrica a própria autorização de
  -- pagamento: bastava chamar esta função pelo PostgREST num período em
  -- 'open' pra materializar as linhas, e o payroll_pix_open_transfer trata a
  -- existência da linha como prova de que a diretoria aprovou. A aprovação
  -- humana viraria opcional — em cima do princípio 3 do CLAUDE.md.
  IF v_status <> 'aprovado_diretoria' THEN
    RAISE EXCEPTION
      'A folha precisa estar aprovada pela diretoria pra congelar os valores (status atual: %)',
      v_status
      USING ERRCODE = '22023';
  END IF;

  -- Autorização: mesmo conjunto que o guard de status já deixa aprovar a folha
  -- (20260727120100) — o caminho do trigger roda com o auth.uid() de quem
  -- aprovou (diretoria/admin_gc), então passa aqui sem exceção especial.
  -- auth.uid() NULL = service_role, job ou migração: sem sessão, sem checagem.
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.is_admin_gc(auth.uid())
       OR EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = auth.uid() AND ur.role::text = 'diretoria')
       OR public.has_module_permission(auth.uid(), v_company, 'financeiro', 'can_edit')
     ) THEN
    RAISE EXCEPTION 'Sem permissão pra congelar os valores da folha';
  END IF;

  -- payroll_entries não tem period_id: o recorte é (company_id, month, year),
  -- exatamente como o usePayrollEntries do front.
  v_month     := extract(month from v_ref)::int;
  v_year      := extract(year  from v_ref)::int;
  v_month_end := (v_ref + interval '1 month - 1 day')::date;

  -- ── Trava de regeneração ────────────────────────────────────────────────
  -- Regerar é DELETE + INSERT do período inteiro (recalcular linha a linha
  -- deixaria órfã a linha cujo lançamento sumiu). Isso é seguro enquanto
  -- ninguém pagou: depois que existe transferência PIX viva, apagar a linha
  -- apagaria a origem de dinheiro que já saiu.
  -- A tabela de transferências chega em outra migration — por isso a checagem
  -- é condicional e por SQL dinâmico (referência estática a tabela inexistente
  -- explodiria em tempo de execução mesmo dentro do IF).
  IF to_regclass('public.payroll_pix_transfers') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM public.payroll_pix_transfers t
       WHERE t.period_id = $1 AND t.status::text <> 'failed'
    $q$ INTO v_pending USING p_period_id;

    IF v_pending > 0 THEN
      RAISE EXCEPTION
        'Essa folha já tem % transferência(s) PIX registrada(s) — os valores não podem ser recalculados', v_pending
        USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.payroll_payable_lines WHERE period_id = p_period_id;

  INSERT INTO public.payroll_payable_lines (
    period_id, company_id, collaborator_id, entry_id, kind,
    gross, inss, irpf, other_deductions, net_amount,
    components, discounts,
    payee_name, payee_document, payee_pix_key, payee_pix_key_norm, payee_pix_key_type,
    has_alimony_block, built_from_status
  )
  WITH entries AS (
    SELECT e.id,
           e.collaborator_id,
           e.type::text                                   AS type,
           e.value,
           e.description,
           e.is_payable,
           coalesce(e.external_id, '') LIKE 'ferias-%'     AS is_vac,
           e.created_at
      FROM public.payroll_entries e
     WHERE e.company_id = v_company
       AND e.month      = v_month
       AND e.year       = v_year
  ),

  -- (a) EARNINGS_TYPES de ../types.ts.
  earnings AS (
    SELECT * FROM entries
     WHERE type IN (
             'salario_base', 'salario_retroativo', 'hora_extra', 'beneficio',
             'bonificacao', 'gratificacao', 'carro_agregado', 'periculosidade',
             'atestado', 'auxilio_vale_transporte', 'ferias', 'salario_familia'
           )
       AND (type <> 'beneficio' OR is_payable IS TRUE)
  ),

  -- (b) Estorno. O RH lança o valor e depois o mesmo valor negativo; o par se
  -- anula. Saldo <= 0 no grupo (colaborador, tipo) → nada daquele tipo entra.
  group_sum AS (
    SELECT collaborator_id, type, sum(value) AS total
      FROM earnings
     GROUP BY collaborator_id, type
  ),
  survivors AS (
    SELECT e.*
      FROM earnings e
      JOIN group_sum g
        ON g.collaborator_id = e.collaborator_id
       AND g.type            = e.type
     WHERE g.total > 0
       AND e.value > 0   -- num grupo que sobreviveu, a perna negativa é descartada
  ),

  -- (c) INSS/IRPF por colaborador, separando mês de férias pelo mesmo prefixo.
  taxes AS (
    SELECT collaborator_id,
           is_vac,
           coalesce(sum(value) FILTER (WHERE type = 'inss'), 0) AS inss,
           coalesce(sum(value) FILTER (WHERE type = 'irpf'), 0) AS irpf
      FROM entries
     WHERE type IN ('inss', 'irpf')
     GROUP BY collaborator_id, is_vac
  ),

  -- (d) MANUAL_DEBIT_TYPES. O `NOT is_vac` é defensivo: férias não tem débito
  -- manual, e se tiver, ele não pode reduzir o cheque de férias.
  --     Agrega o TOTAL e os RÓTULOS na mesma passada: o total é o que entra na
  --     conta do líquido, e a lista é o que a tela mostra item a item. Somar sem
  --     guardar os nomes é o que fazia o congelado dizer "− R$ 150" sem dizer
  --     de quê.
  debits AS (
    SELECT collaborator_id,
           sum(value) AS total,
           jsonb_agg(
             jsonb_build_object(
               'label', public.payroll_entry_label(type, description),
               'value', value
             )
             ORDER BY created_at DESC, id
           ) AS items
      FROM entries
     WHERE type IN ('falta', 'adiantamento', 'desconto', 'emprestimo')
       AND NOT is_vac
       AND value > 0
     GROUP BY collaborator_id
  ),

  -- (e) Mescla mensal: um pagamento só com salário base, gratificação, hora
  -- extra, periculosidade e salário-família. É também o recorte correto do
  -- líquido — o INSS/IRPF do mês incide sobre essa base, então o imposto sai
  -- daqui em vez de sair todo do salário base.
  merged AS (
    SELECT s.*, public.payroll_monthly_merged_rank(s.type) AS rk
      FROM survivors s
     WHERE NOT s.is_vac
       AND public.payroll_monthly_merged_rank(s.type) IS NOT NULL
  ),
  merged_agg AS (
    SELECT collaborator_id,
           sum(value) AS gross,
           jsonb_agg(
             jsonb_build_object(
               'entryId',  id,
               'type',     type,
               -- Salário base tem rótulo fixo; os adicionais mostram a
               -- descrição do lançamento (é onde o RH escreve o motivo).
               'label',    CASE WHEN type = 'salario_base' THEN 'Salário Base'
                                ELSE public.payroll_entry_label(type, description) END,
               'value',    value
             )
             ORDER BY rk, created_at DESC, id
           ) AS components,
           -- ÂNCORA: o salário base quando existe. É o lançamento mais estável
           -- entre recálculos (todo mês tem um, e ele não nasce/some conforme o
           -- RH lança hora extra), então a marcação de "pago" sobrevive à
           -- regeração. Sem salário base, cai no primeiro da ordem da mescla.
           (array_agg(id ORDER BY (type = 'salario_base') DESC, rk, created_at DESC, id))[1] AS anchor_id
      FROM merged
     GROUP BY collaborator_id
  ),
  monthly AS (
    SELECT m.collaborator_id,
           m.anchor_id,
           'mensal'::text            AS kind,
           m.gross,
           coalesce(t.inss, 0)       AS inss,
           coalesce(t.irpf, 0)       AS irpf,
           coalesce(d.total, 0)      AS other_deductions,
           m.components,
           -- Só o mensal tem desconto manual (regra (d)); sem débito no mês, o
           -- array é vazio e não NULL — a coluna é NOT NULL.
           coalesce(d.items, '[]'::jsonb) AS discounts
      FROM merged_agg m
      LEFT JOIN taxes  t ON t.collaborator_id = m.collaborator_id AND t.is_vac = false
      LEFT JOIN debits d ON d.collaborator_id = m.collaborator_id
  ),

  -- Fora da mescla (bonificação/custo de setor, carro agregado, benefício
  -- pagável, atestado, VT, salário retroativo): cada um em sua linha, SEM
  -- imposto e SEM desconto. A diretoria confere esses à parte, e o imposto do
  -- mês já foi consumido pela linha mensal.
  avulsos AS (
    SELECT s.collaborator_id,
           s.id            AS anchor_id,
           'avulso'::text  AS kind,
           s.value         AS gross,
           0::numeric      AS inss,
           0::numeric      AS irpf,
           0::numeric      AS other_deductions,
           jsonb_build_array(jsonb_build_object(
             'entryId',  s.id,
             'type',     s.type,
             'label',    public.payroll_entry_label(s.type, s.description),
             'value',    s.value
           ))             AS components,
           -- Avulso não sofre desconto manual (regra (e)): o débito do mês já
           -- foi consumido pela linha mensal, descontar de novo pagaria a menos.
           '[]'::jsonb    AS discounts
      FROM survivors s
     WHERE NOT s.is_vac
       AND public.payroll_monthly_merged_rank(s.type) IS NULL
  ),

  -- Cheque de férias: férias + 1/3 + gratificação s/ férias numa linha, menos o
  -- INSS/IRRF de férias. Âncora: o provento principal ('ferias'); se não vier,
  -- o primeiro do grupo.
  vacation AS (
    SELECT s.collaborator_id,
           (array_agg(s.id ORDER BY (s.type = 'ferias') DESC, s.created_at DESC, s.id))[1] AS anchor_id,
           'ferias'::text AS kind,
           sum(s.value)   AS gross,
           jsonb_agg(
             jsonb_build_object(
               'entryId',  s.id,
               'type',     s.type,
               'label',    public.payroll_entry_label(s.type, s.description),
               'value',    s.value
             )
             ORDER BY s.created_at DESC, s.id
           ) AS components
      FROM survivors s
     WHERE s.is_vac
     GROUP BY s.collaborator_id
  ),
  vacation_lines AS (
    SELECT v.collaborator_id,
           v.anchor_id,
           v.kind,
           v.gross,
           coalesce(t.inss, 0)  AS inss,
           coalesce(t.irpf, 0)  AS irpf,
           0::numeric           AS other_deductions,
           v.components,
           -- Regra (d): débito manual nunca reduz o cheque de férias, logo não
           -- há o que listar aqui.
           '[]'::jsonb          AS discounts
      FROM vacation v
      LEFT JOIN taxes t ON t.collaborator_id = v.collaborator_id AND t.is_vac = true
  ),

  all_lines AS (
    SELECT * FROM monthly
    UNION ALL
    SELECT * FROM avulsos
    UNION ALL
    SELECT * FROM vacation_lines
  ),

  -- Pensão alimentícia vigente no mês de referência (vigência que cobre
  -- qualquer dia do mês).
  alimony AS (
    SELECT DISTINCT collaborator_id
      FROM public.collaborator_alimony_orders
     WHERE company_id = v_company
       AND status = 'active'
       AND effective_from <= v_month_end
       AND (effective_to IS NULL OR effective_to >= v_ref)
  )

  SELECT p_period_id,
         v_company,
         l.collaborator_id,
         l.anchor_id,
         l.kind,
         l.gross,
         l.inss,
         l.irpf,
         l.other_deductions,
         l.gross - l.inss - l.irpf - l.other_deductions,
         l.components,
         l.discounts,
         -- Snapshot do favorecido no instante da aprovação. As colunas geradas
         -- pix_key_type/pix_key_normalized vêm da migration 20260818120000 —
         -- aqui elas viram payee_pix_key_type/payee_pix_key_norm.
         c.name,
         c.cpf,
         c.pix_key,
         c.pix_key_normalized,
         c.pix_key_type,
         (a.collaborator_id IS NOT NULL),
         v_status
    FROM all_lines l
    JOIN public.collaborators c ON c.id = l.collaborator_id
    LEFT JOIN alimony a ON a.collaborator_id = l.collaborator_id
   -- CLAMP. Líquido zero ou negativo NÃO vira pagamento: não existe PIX de zero,
   -- e um valor negativo viraria cobrança. Quem cai aqui (adiantamento que comeu
   -- o mês inteiro, por exemplo) continua aparecendo na tela de aprovação — some
   -- só da lista de quem recebe, de propósito, pra o acerto ser feito na mão.
   WHERE l.gross - l.inss - l.irpf - l.other_deductions > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$fn$;

COMMENT ON FUNCTION public.payroll_build_payable_lines(uuid) IS
  'Congela os valores a pagar da folha. Tradução SQL de src/modules/payroll/lib/buildPaymentLines.ts. Regenera por DELETE+INSERT; recusa se já houver transferência PIX no período.';

-- EXECUTE é concedido a PUBLIC por padrão no Postgres — e esta função escreve
-- dinheiro. Fecha e reabre só pra quem loga (a checagem fina está no corpo).
REVOKE EXECUTE ON FUNCTION public.payroll_build_payable_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_build_payable_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_entry_label(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_monthly_merged_rank(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Gatilho: a aprovação da diretoria congela os valores
--    No trigger e não na RPC pelo mesmo motivo de 20260727120100: o front muda
--    status com PATCH direto no PostgREST, então qualquer caminho de escrita
--    precisa passar por aqui. É também o instante certo — 'aprovado_diretoria'
--    é onde payroll_period_is_locked() trava os lançamentos, ou seja, é o
--    primeiro momento em que os números param de mudar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_period_freeze_payable_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'aprovado_diretoria'
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.payroll_build_payable_lines(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_period_freeze_payable_lines ON public.payroll_periods;
CREATE TRIGGER trg_payroll_period_freeze_payable_lines
  AFTER UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_freeze_payable_lines();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — leitura por papel, escrita por ninguém
--    Só o builder (SECURITY DEFINER, dono da função) escreve. A ausência de
--    policy de INSERT/UPDATE/DELETE é intencional: com RLS ligada e sem policy,
--    nenhum usuário autenticado grava valor de pagamento na mão.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_payable_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gc reads all payable lines" ON public.payroll_payable_lines;
DROP POLICY IF EXISTS "company reads own payable lines"  ON public.payroll_payable_lines;

CREATE POLICY "admin_gc reads all payable lines" ON public.payroll_payable_lines
  FOR SELECT USING (public.is_admin_gc(auth.uid()));

-- Args de user_belongs_to_company na ORDEM CERTA (_user_id, _company_id) —
-- policies antigas do repo passam invertido e só funcionam pela tolerância
-- introduzida em 20260616120000.
--
-- Papéis: admin_gc / rh / diretoria. contador e gestor_gc ficaram DE FORA de
-- propósito, por dois motivos que se somam:
--   1) has_alimony_block revela a EXISTÊNCIA de ordem judicial de pensão —
--      dado sensível que collaborator_alimony_orders (20260512101000) já
--      restringe a admin_gc/admin/rh. Liberar a flag aqui contornaria aquela
--      policy por via indireta;
--   2) payroll_pix_transfers (20260818120200) lê com a lista estreita, e as
--      duas tabelas carregam a mesma matéria (chave PIX, documento, líquido de
--      pessoa identificada). Listas diferentes pro mesmo dado é convite a
--      vazamento pelo lado mais frouxo.
-- Se contador precisar de folha, o caminho é uma view agregada sem PII.
CREATE POLICY "company reads own payable lines" ON public.payroll_payable_lines
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), payroll_payable_lines.company_id)
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role::text IN ('admin_gc', 'rh', 'diretoria')
    )
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
-- Derruba o congelamento inteiro. Perde o histórico de valores já congelados —
-- exporte payroll_payable_lines antes se a folha do mês já foi aprovada.
--
-- A coluna `discounts` e as constraints ..._entry_uk / ..._period_entry_uk vão
-- junto no DROP TABLE (não precisam de linha própria); as duas funções de
-- espelho caem por último porque o builder depende delas.
--
-- ATENÇÃO À ORDEM: payroll_pix_transfers (20260818120200) referencia
-- payroll_payable_lines(id). Se aquela migration estiver aplicada, o DROP TABLE
-- abaixo falha — reverta a 120200 primeiro.
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_payroll_period_freeze_payable_lines ON public.payroll_periods;
--   DROP FUNCTION IF EXISTS public.payroll_period_freeze_payable_lines();
--   DROP FUNCTION IF EXISTS public.payroll_build_payable_lines(uuid);
--
--   DROP POLICY IF EXISTS "company reads own payable lines"  ON public.payroll_payable_lines;
--   DROP POLICY IF EXISTS "admin_gc reads all payable lines" ON public.payroll_payable_lines;
--
--   DROP TRIGGER IF EXISTS audit_payroll_payable_lines   ON public.payroll_payable_lines;
--   DROP TRIGGER IF EXISTS set_updated_at_payable_lines  ON public.payroll_payable_lines;
--
--   DROP INDEX IF EXISTS public.idx_payable_lines_alimony;
--   DROP INDEX IF EXISTS public.idx_payable_lines_company;
--   DROP INDEX IF EXISTS public.idx_payable_lines_collaborator;
--   DROP INDEX IF EXISTS public.idx_payable_lines_period;
--
--   DROP TABLE IF EXISTS public.payroll_payable_lines;
--
--   DROP FUNCTION IF EXISTS public.payroll_monthly_merged_rank(text);
--   DROP FUNCTION IF EXISTS public.payroll_entry_label(text, text);
-- COMMIT;
