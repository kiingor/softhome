-- Migration: 20260818120200_payroll_pix_transfers.sql
-- Description: registro de cada TENTATIVA de PIX da folha, com o estado real do
-- dinheiro, e correção de payroll_payments pra virar PROJEÇÃO desse registro.
--
-- POR QUE UMA TABELA NOVA E NÃO MAIS COLUNAS EM payroll_payments
-- payroll_payments responde "esse lançamento está pago?" — uma linha por
-- lançamento (UNIQUE (entry_id)), que o RH marca e desmarca na mão desde maio.
-- Isso não comporta a pergunta que o PIX obriga a responder: "o dinheiro saiu?".
-- Uma transferência tem tentativas, tem estado intermediário, tem timeout, e
-- acima de tudo é IRREVERSÍVEL — o registro dela não pode ser um booleano que
-- alguém desmarca. Então:
--   • payroll_pix_transfers = FATO, append-mostly, uma linha por tentativa;
--   • payroll_payments      = PROJEÇÃO ("pago" = paid_at não nulo), alimentada
--                             pelo settle e nunca sobrescrita por ele.
-- O UNIQUE (entry_id) de payroll_payments é ATIVO, não dívida: é exatamente o
-- alvo do ON CONFLICT do settle. Fica onde está.
--
-- OS ESTADOS SÃO DEFINIDOS POR ONDE O DINHEIRO ESTÁ, NÃO POR ONDE O CÓDIGO ESTÁ
-- Essa é a decisão central do arquivo. O contrato do Santander (extraído do
-- sandbox, POST|GET /management_payments_partners/v1/workspaces/{id}/pix_payments)
-- tem duas etapas: o POST cria o pagamento em READY_TO_PAY e NÃO MOVE DINHEIRO;
-- só a confirmação move, e o dinheiro só é fato quando volta um endToEnd. Um
-- enum que copiasse os nomes do provedor ('ready_to_pay', 'payed') herdaria a
-- ambiguidade. Os nossos labels respondem sempre a mesma pergunta:
--   created   → nada saiu. GARANTIDO (a linha existe, a chamada nem foi feita).
--   sent      → POST aceito (READY_TO_PAY). Ainda NÃO move dinheiro.
--   confirmed → confirmação aceita. O dinheiro está andando.
--   settled   → liquidado, com endToEnd na mão. Único estado que vira pagamento.
--   failed    → recusa DETERMINÍSTICA do banco (saldo, chave inválida, 4xx de
--               negócio). Sabemos que não saiu.
--   unknown   → timeout / 5xx / token vencido no meio. NÃO SABEMOS se saiu.
--
-- POR QUE 'unknown' NUNCA FAZ RETRY AUTOMÁTICO
-- 'unknown' não é "falhou", é "não sabemos". O token OAuth do Santander expira
-- em 900s e a request pode estourar DEPOIS que o banco já registrou o pagamento
-- — a resposta se perde, o dinheiro não. Um retry automático em cima disso é uma
-- aposta com o dinheiro dos outros: se a primeira tentativa tinha vingado, a
-- segunda paga o colaborador DUAS VEZES, e PIX não tem estorno unilateral. Por
-- isso, aqui, 'unknown':
--   1. CONTA como tentativa em voo no índice parcial de unicidade — enquanto
--      estiver assim, ninguém abre outra tentativa pro mesmo lançamento;
--   2. tem next_check_at, mas o que roda nele é CONSULTA (GET), nunca reenvio;
--   3. só sai desse estado por payroll_pix_resolve_unknown, que é HUMANA e exige
--      motivo escrito — e, pra virar 'settled', exige o endToEnd.
-- Errar pra "trava e chama gente" custa um pagamento atrasado. Errar pra "tenta
-- de novo" custa um pagamento duplicado que não volta.
--
-- DEPENDE de 20260818120100_payroll_payable_lines (roda antes): a linha pagável
-- é a FONTE do valor e do snapshot do favorecido, e a existência dela é o
-- próprio portão de aprovação — o builder só materializa linha de período
-- aprovado. Por isso "sem linha" aqui vira erro de "período não aprovado", e não
-- um cálculo de valor feito neste arquivo.
--
-- LGPD: a tabela guarda nome, documento e chave PIX de pessoa identificada →
-- audit_log_trigger anexada e company_id NA PRÓPRIA TABELA (o trigger deriva o
-- company_id de to_jsonb(NEW)->>'company_id'; sem a coluna, a linha do audit
-- nasce com company_id NULL e só admin_gc enxerga — ver a policy
-- "gestor_gc reads own company audit"). É o mesmo defeito que payroll_payments
-- carrega desde maio e que o item 3 desta migration corrige.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Estados
--    CREATE TYPE (e não ALTER TYPE ADD VALUE) permite usar os labels na MESMA
--    transação — inclusive em predicado de índice parcial. É o oposto do caso
--    de 20260727120000/120100, que precisou de duas migrations justamente por
--    ter usado ALTER TYPE.
--
--    IDEMPOTÊNCIA: este projeto já teve deploy pela metade (migration aplicada
--    sem entrar em schema_migrations), então reexecutar uma migration inteira é
--    cenário real, não hipótese. Daqui pro fim do arquivo tudo é reexecutável —
--    guarda em pg_type pro CREATE TYPE (que não aceita IF NOT EXISTS), IF NOT
--    EXISTS no resto e DROP IF EXISTS antes de trigger e policy. Mesmo padrão de
--    20260818120000.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'pix_transfer_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.pix_transfer_status AS ENUM (
      'created', 'sent', 'confirmed', 'settled', 'failed', 'unknown'
    );
  END IF;
END $$;

COMMENT ON TYPE public.pix_transfer_status IS
  'Onde o dinheiro está. created=não saiu (garantido); sent=POST aceito (READY_TO_PAY, não move); confirmed=confirmação aceita; settled=liquidado com endToEnd; failed=recusa determinística; unknown=não sabemos (timeout) — resolução humana.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. payroll_pix_transfers — uma linha por TENTATIVA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_pix_transfers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalizados de propósito: company_id faz a auditoria e a RLS
  -- funcionarem sem JOIN, e period_id/collaborator_id sobrevivem a qualquer
  -- recálculo da folha. ON DELETE RESTRICT em tudo: apagar o lançamento de um
  -- PIX que já saiu apagaria o rastro do dinheiro. Se o RH precisa excluir o
  -- lançamento, o erro do RESTRICT é a resposta certa.
  company_id       uuid NOT NULL REFERENCES public.companies(id)      ON DELETE RESTRICT,
  period_id        uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE RESTRICT,
  entry_id         uuid NOT NULL REFERENCES public.payroll_entries(id) ON DELETE RESTRICT,
  collaborator_id  uuid NOT NULL REFERENCES public.collaborators(id)   ON DELETE RESTRICT,
  -- SET NULL, e não RESTRICT: a linha pagável é proveniência, não o rastro do
  -- dinheiro — este já está inteiro aqui (snapshot do favorecido, valor, e2e).
  -- Com RESTRICT, uma única tentativa recusada travaria a folha PARA SEMPRE:
  -- devolver pra rascunho, corrigir a chave e re-aprovar dispara o rebuild, que
  -- faz DELETE das linhas e esbarraria na FK da tentativa 'failed' — abortando
  -- a transação do próprio AFTER UPDATE. A diretoria não conseguiria mais
  -- aprovar a folha depois do primeiro PIX recusado, que é o caso comum.
  payable_line_id  uuid REFERENCES public.payroll_payable_lines(id) ON DELETE SET NULL,

  attempt          int  NOT NULL CHECK (attempt >= 1),

  -- Chave de idempotência mandada ao banco. Derivada de (entry_id, attempt) —
  -- estável: repetir o POST da MESMA tentativa depois de um timeout não gera
  -- segundo pagamento no provedor; abrir tentativa nova muda a chave de
  -- propósito, porque aí é outra ordem de pagamento.
  idempotency_key  text NOT NULL,

  amount           numeric(12,2) NOT NULL CHECK (amount > 0),

  -- SNAPSHOT do favorecido no instante do envio. Não é redundância com
  -- collaborators: é prova. Se alguém trocar a chave PIX do cadastro depois,
  -- precisamos saber pra QUAL chave o dinheiro foi mandado naquele dia — sem
  -- isso não há como auditar um pagamento contestado.
  payee_name          text NOT NULL,
  payee_document      text,
  payee_pix_key       text NOT NULL,
  payee_pix_key_norm  text NOT NULL,
  payee_pix_key_type  public.pix_key_type NOT NULL,

  -- Pagador (conta débito / CNPJ da filial) e o corpo exato enviado. jsonb
  -- porque o contrato do provedor muda sem nos avisar e um schema rígido aqui
  -- viraria migration a cada release deles.
  payer_snapshot   jsonb,
  request_payload  jsonb,

  provider         text NOT NULL DEFAULT 'santander',
  -- Sem default: o ambiente é o que separa "ensaiei" de "paguei". A RPC decide
  -- (e o default DELA é 'sandbox' — o valor inofensivo).
  environment      text NOT NULL CHECK (environment IN ('sandbox', 'production')),

  status           public.pix_transfer_status NOT NULL DEFAULT 'created',

  -- Eco do provedor. provider_status guarda o label CRU dele (READY_TO_PAY,
  -- PAYED, …) sem tradução: quando o suporte do banco perguntar, é isso que
  -- responde, e um label novo do Santander não quebra nosso enum.
  provider_payment_id text,
  end_to_end_id       text,
  provider_status     text,
  response_payload    jsonb,
  http_status         int,
  error_code          text,
  error_message       text,

  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  confirmed_at     timestamptz,
  settled_at       timestamptz,
  failed_at        timestamptz,

  -- Agenda do poller. next_check_at é quando CONSULTAR (GET) de novo — nunca
  -- quando reenviar. Ver o cabeçalho sobre 'unknown'.
  last_checked_at  timestamptz,
  next_check_at    timestamptz,
  check_count      int NOT NULL DEFAULT 0,

  -- Preenchidos só na saída humana de 'unknown'.
  resolved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_reason  text,

  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- CONSTRAINTs (e não índices parciais): estas são alvo potencial de ON
  -- CONFLICT, e o supabase-js não consegue apontar pra índice parcial — a
  -- armadilha documentada em 20260518182932.
  CONSTRAINT payroll_pix_transfers_idempotency_uk UNIQUE (idempotency_key),
  CONSTRAINT payroll_pix_transfers_entry_attempt_uk UNIQUE (entry_id, attempt),

  -- Liquidado sem endToEnd é boato: o endToEnd é o identificador do PIX no SPI,
  -- é o que se leva ao banco pra provar que o dinheiro saiu. Sem ele o status
  -- 'settled' seria só uma opinião do nosso código.
  CONSTRAINT payroll_pix_transfers_settled_needs_e2e
    CHECK (status <> 'settled' OR end_to_end_id IS NOT NULL)
);

COMMENT ON TABLE public.payroll_pix_transfers IS
  'Uma linha por TENTATIVA de PIX da folha. Fato irreversível: sem policy de escrita, sem UPDATE de usuário. payroll_payments é a projeção "pago" derivada daqui.';
COMMENT ON COLUMN public.payroll_pix_transfers.idempotency_key IS
  'Derivada de (entry_id, attempt). Estável dentro da tentativa: reenviar o POST após timeout não duplica o pagamento no provedor.';
COMMENT ON COLUMN public.payroll_pix_transfers.next_check_at IS
  'Quando CONSULTAR (GET) o pagamento de novo. Nunca quando reenviar — em nenhum status, e menos ainda em unknown.';
COMMENT ON COLUMN public.payroll_pix_transfers.payee_pix_key IS
  'Chave PIX como estava no cadastro NO MOMENTO do envio. É prova de pra onde o dinheiro foi, não cópia de conveniência do cadastro.';

-- ── Guardas (índices PARCIAIS, nunca alvo de ON CONFLICT) ───────────────────

-- No máximo UMA tentativa em voo por lançamento. 'unknown' entra na lista de
-- propósito: enquanto não soubermos onde o dinheiro está, abrir outra tentativa
-- é assinar embaixo de um pagamento em dobro. Esta é a última linha de defesa —
-- a RPC já serializa com advisory lock, mas o índice é o que vale mesmo se
-- alguém escrever direto com service_role.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_pix_transfers_one_in_flight
  ON public.payroll_pix_transfers (entry_id)
  WHERE status IN ('created', 'sent', 'confirmed', 'unknown');

-- E no máximo UMA liquidada por lançamento — a de verdade, a que virou dinheiro.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_pix_transfers_one_settled
  ON public.payroll_pix_transfers (entry_id)
  WHERE status = 'settled';

-- Dois registros com o mesmo endToEnd seriam o MESMO PIX contado duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_pix_transfers_e2e_uk
  ON public.payroll_pix_transfers (end_to_end_id)
  WHERE end_to_end_id IS NOT NULL;

-- Idem pro id do pagamento no provedor, por ambiente (sandbox e produção são
-- workspaces distintos e podem repetir id sem relação nenhuma entre si).
CREATE UNIQUE INDEX IF NOT EXISTS payroll_pix_transfers_provider_payment_uk
  ON public.payroll_pix_transfers (provider, environment, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

-- Fila do poller: "o que preciso consultar agora".
CREATE INDEX IF NOT EXISTS payroll_pix_transfers_due_check
  ON public.payroll_pix_transfers (next_check_at)
  WHERE status IN ('sent', 'confirmed', 'unknown');

CREATE INDEX IF NOT EXISTS payroll_pix_transfers_period  ON public.payroll_pix_transfers (period_id, status);
CREATE INDEX IF NOT EXISTS payroll_pix_transfers_company ON public.payroll_pix_transfers (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payroll_pix_transfers_collab  ON public.payroll_pix_transfers (collaborator_id, created_at DESC);

-- CREATE TRIGGER não aceita IF NOT EXISTS: DROP antes é o que torna a segunda
-- execução possível sem "trigger already exists".
DROP TRIGGER IF EXISTS set_updated_at_payroll_pix_transfers ON public.payroll_pix_transfers;
CREATE TRIGGER set_updated_at_payroll_pix_transfers
  BEFORE UPDATE ON public.payroll_pix_transfers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- PII: nome, documento e chave PIX de pessoa identificada, além do valor.
DROP TRIGGER IF EXISTS audit_payroll_pix_transfers ON public.payroll_pix_transfers;
CREATE TRIGGER audit_payroll_pix_transfers
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_pix_transfers
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. payroll_payments vira PROJEÇÃO
--
--    company_id: a tabela nasceu sem ele (20260505150000), e como
--    audit_log_trigger deriva company_id de to_jsonb(NEW)->>'company_id', TODA
--    linha do audit_log de payroll_payments desde maio está com company_id
--    NULL — ou seja, o RH nunca viu a auditoria dos próprios pagamentos
--    (a policy "gestor_gc reads own company audit" exige company_id IS NOT
--    NULL). Backfill + trigger que deriva daqui em diante corrigem os dois
--    lados: histórico e futuro.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_payments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- CHECK fechado de propósito: quem decide se o pagamento é intocável é o
  -- valor 'pix_santander'. Um typo ('pix-santander') desligaria a trava em
  -- silêncio — o CHECK transforma o typo em erro na hora da escrita.
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'manual'
    CHECK (method IN ('manual', 'pix_santander')),
  ADD COLUMN IF NOT EXISTS settled_transfer_id uuid
    REFERENCES public.payroll_pix_transfers(id) ON DELETE RESTRICT;

UPDATE public.payroll_payments pp
   SET company_id = p.company_id
  FROM public.payroll_periods p
 WHERE p.id = pp.period_id
   AND pp.company_id IS DISTINCT FROM p.company_id;

-- Só depois do backfill, e seguro porque o trigger abaixo deriva o valor mesmo
-- quando o client não manda (PaymentsTab.tsx insere sem company_id).
ALTER TABLE public.payroll_payments
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_payments_company
  ON public.payroll_payments (company_id, period_id);

COMMENT ON COLUMN public.payroll_payments.company_id IS
  'Denormalizado do período. Existe pra que audit_log_trigger consiga carimbar company_id — sem ele a auditoria de pagamento nasce invisível pro RH.';
COMMENT ON COLUMN public.payroll_payments.settled_transfer_id IS
  'Tentativa de PIX que liquidou este pagamento. NULL = marcado na mão pelo financeiro.';

-- Guard de payroll_payments.
-- Mora no TRIGGER, não na RPC, porque o front faz UPDATE direto no PostgREST
-- (PaymentsTab.tsx togglePayment) — uma RPC sozinha não protegeria nada. E não
-- tem escape por auth.uid() IS NULL: nem service_role desmarca um PIX
-- liquidado. Desmarcar um pagamento que saiu de verdade não corrige nada no
-- mundo real; só faz o sistema mentir sobre onde o dinheiro está.
CREATE OR REPLACE FUNCTION public.payroll_payments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apagar a linha é desmarcar por outro caminho: some da tela do mesmo jeito,
  -- e ainda leva junto o vínculo com a transferência.
  IF TG_OP = 'DELETE' THEN
    IF OLD.method = 'pix_santander' AND OLD.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'Esse pagamento saiu por PIX — o registro não pode ser apagado'
        USING ERRCODE = '22023';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.company_id IS NULL THEN
    SELECT p.company_id INTO NEW.company_id
      FROM public.payroll_periods p WHERE p.id = NEW.period_id;
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Período do pagamento não existe';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.method = 'pix_santander' AND OLD.paid_at IS NOT NULL AND NEW.paid_at IS NULL THEN
      RAISE EXCEPTION 'Esse pagamento saiu por PIX e já foi liquidado — não dá pra desmarcar'
        USING ERRCODE = '22023';
    END IF;
    -- Apagar o vínculo com a tentativa é a mesma mentira por outro caminho.
    IF OLD.settled_transfer_id IS NOT NULL
       AND NEW.settled_transfer_id IS DISTINCT FROM OLD.settled_transfer_id THEN
      RAISE EXCEPTION 'Esse pagamento está amarrado a uma transferência PIX liquidada'
        USING ERRCODE = '22023';
    END IF;
    -- Idem trocar o método de um PIX liquidado pra 'manual'.
    IF OLD.method = 'pix_santander' AND NEW.method <> OLD.method THEN
      RAISE EXCEPTION 'Não dá pra mudar o método de um pagamento que saiu por PIX'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_payments_guard ON public.payroll_payments;
CREATE TRIGGER trg_payroll_payments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.payroll_payments_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Contrato com payroll_payable_lines (20260818120100)
--    As RPCs abaixo leem colunas daquela tabela. Corpo de plpgsql não é
--    validado na criação: um nome divergente só apareceria no primeiro clique
--    em "Pagar", que é o pior lugar possível pra descobrir. Este DO derruba o
--    DEPLOY em vez do pagamento.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
    FROM unnest(ARRAY[
      'id', 'company_id', 'period_id', 'entry_id', 'collaborator_id', 'net_amount',
      'payee_name', 'payee_document', 'payee_pix_key', 'payee_pix_key_norm',
      'payee_pix_key_type', 'has_alimony_block'
    ]) AS t(c)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name   = 'payroll_payable_lines'
        AND ic.column_name  = c
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'payroll_payable_lines não tem as colunas que payroll_pix_open_transfer lê: %', v_missing;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPCs
--    Todas SECURITY DEFINER e todas fechadas pra anon/authenticated: quem
--    manda dinheiro é a edge function com service_role, nunca o browser. A anon
--    key está no bundle do frontend por design (ver 20260814100400), então uma
--    RPC de pagamento executável por PUBLIC seria um botão "pagar" na internet.
-- ─────────────────────────────────────────────────────────────────────────────

-- 5.1 Abrir tentativa. É a única porta de entrada.
CREATE OR REPLACE FUNCTION public.payroll_pix_open_transfer(
  p_entry_id    uuid,
  p_actor       uuid,
  -- Terceiro parâmetro com DEFAULT pra que a chamada de dois argumentos siga
  -- válida. O default é 'sandbox' porque, na dúvida, o valor certo é o que não
  -- move dinheiro de verdade.
  p_environment text DEFAULT 'sandbox'
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line      public.payroll_payable_lines%ROWTYPE;
  v_transfer  public.payroll_pix_transfers%ROWTYPE;
  v_payment   public.payroll_payments%ROWTYPE;
  v_company   public.companies%ROWTYPE;
  v_attempt   int;
BEGIN
  -- coalesce porque NULL NOT IN (...) é NULL, e IF NULL passa reto: sem isso um
  -- ambiente nulo só estouraria lá na frente, no NOT NULL da coluna.
  IF coalesce(p_environment, '') NOT IN ('sandbox', 'production') THEN
    RAISE EXCEPTION 'Ambiente inválido: %', p_environment USING ERRCODE = '22023';
  END IF;

  -- Dois cliques no mesmo botão viram FILA, não corrida. O lock é por
  -- lançamento e cai sozinho no fim da transação; o segundo clique entra aqui
  -- só depois do primeiro ter inserido, e por isso enxerga a tentativa em voo
  -- lá embaixo em vez de criar uma segunda.
  PERFORM pg_advisory_xact_lock(
    hashtext('payroll_pix_transfers'), hashtext(p_entry_id::text));

  -- A linha pagável é o portão de aprovação: o builder só materializa linha de
  -- período aprovado pela diretoria. Ausência de linha = folha não liberada.
  SELECT * INTO v_line
    FROM public.payroll_payable_lines
   WHERE entry_id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esse lançamento não tem linha pagável — a folha ainda não foi aprovada pela diretoria'
      USING ERRCODE = '22023';
  END IF;

  -- Cinto e suspensório: a existência da linha JÁ deveria provar a aprovação
  -- (o builder recusa período não aprovado), mas dinheiro não sai com base numa
  -- inferência. Aqui a origem é consultada direto.
  PERFORM 1
     FROM public.payroll_periods p
    WHERE p.id = v_line.period_id
      AND p.status IN ('aprovado_diretoria', 'closed', 'exported');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A folha desse lançamento não está aprovada pela diretoria'
      USING ERRCODE = '22023';
  END IF;

  -- Pensão alimentícia é ordem judicial: o líquido do colaborador não é o
  -- líquido da folha até alguém tratar o desconto. Pagar cheio aqui é
  -- descumprir decisão e mandar dinheiro que não volta.
  IF coalesce(v_line.has_alimony_block, false) THEN
    RAISE EXCEPTION 'Colaborador com pensão alimentícia ativa — esse pagamento sai fora do PIX automático'
      USING ERRCODE = '22023';
  END IF;

  -- Sem tipo de chave não há como montar o dictCodeType do Santander. Barrar
  -- aqui é melhor do que deixar o banco adivinhar o formato da chave.
  IF v_line.payee_pix_key_type IS NULL
     OR nullif(btrim(coalesce(v_line.payee_pix_key_norm, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Chave PIX do colaborador não está válida no cadastro — corrija antes de pagar'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (coalesce(v_line.net_amount, 0) > 0) THEN
    RAISE EXCEPTION 'Linha sem valor a pagar (líquido %)', coalesce(v_line.net_amount, 0)
      USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE: segura a projeção até o fim da transação. Sem isso, marcar
  -- "pago" na mão e clicar em "Pagar por PIX" ao mesmo tempo passaria pelos
  -- dois caminhos.
  SELECT * INTO v_payment
    FROM public.payroll_payments
   WHERE entry_id = p_entry_id
     FOR UPDATE;
  IF FOUND AND v_payment.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esse pagamento já está marcado como pago (%)', v_payment.method
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payroll_pix_transfers
     WHERE entry_id = p_entry_id AND status = 'settled'
  ) THEN
    RAISE EXCEPTION 'Esse lançamento já foi liquidado por PIX' USING ERRCODE = '22023';
  END IF;

  -- Clicar de novo é NO-OP: devolve a mesma tentativa. Inclui 'unknown' —
  -- enquanto não soubermos onde o dinheiro está, a resposta certa é "essa aqui,
  -- e alguém precisa resolvê-la", nunca "toma uma nova".
  SELECT * INTO v_transfer
    FROM public.payroll_pix_transfers
   WHERE entry_id = p_entry_id
     AND status IN ('created', 'sent', 'confirmed', 'unknown')
   ORDER BY attempt DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN v_transfer;
  END IF;

  SELECT coalesce(max(attempt), 0) + 1 INTO v_attempt
    FROM public.payroll_pix_transfers WHERE entry_id = p_entry_id;

  SELECT * INTO v_company FROM public.companies WHERE id = v_line.company_id;

  INSERT INTO public.payroll_pix_transfers (
    company_id, period_id, entry_id, collaborator_id, payable_line_id,
    attempt, idempotency_key, amount,
    payee_name, payee_document, payee_pix_key, payee_pix_key_norm, payee_pix_key_type,
    payer_snapshot, provider, environment, status, created_by
  ) VALUES (
    v_line.company_id, v_line.period_id, v_line.entry_id, v_line.collaborator_id, v_line.id,
    v_attempt,
    -- Sem hífens pra caber em campo curto de provedor sem virar truncamento.
    'sh-' || replace(p_entry_id::text, '-', '') || '-' || v_attempt::text,
    v_line.net_amount,
    v_line.payee_name, v_line.payee_document,
    v_line.payee_pix_key, v_line.payee_pix_key_norm, v_line.payee_pix_key_type,
    jsonb_build_object(
      'documentNumber', v_company.cnpj,
      'documentType',   'CNPJ',
      'name',           v_company.company_name
    ),
    'santander', p_environment, 'created', p_actor
  )
  RETURNING * INTO v_transfer;

  RETURN v_transfer;
END;
$$;

COMMENT ON FUNCTION public.payroll_pix_open_transfer(uuid, uuid, text) IS
  'Abre (ou devolve) a tentativa de PIX em voo do lançamento. Não chama o banco: só registra que vamos chamar. Status inicial created = nada saiu.';

-- 5.2 POST aceito. READY_TO_PAY ainda NÃO é dinheiro — por isso 'sent', e não
--     um nome que sugira pagamento.
CREATE OR REPLACE FUNCTION public.payroll_pix_mark_sent(
  p_id                  uuid,
  p_provider_payment_id text,
  p_provider_status     text  DEFAULT NULL,
  p_response            jsonb DEFAULT NULL,
  p_http_status         int   DEFAULT NULL
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.payroll_pix_transfers%ROWTYPE;
BEGIN
  UPDATE public.payroll_pix_transfers
     SET status              = 'sent',
         sent_at             = coalesce(sent_at, now()),
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         provider_status     = coalesce(p_provider_status, provider_status),
         response_payload    = coalesce(p_response, response_payload),
         http_status         = coalesce(p_http_status, http_status),
         last_checked_at     = now(),
         next_check_at       = now() + interval '20 seconds'
   WHERE id = p_id
     AND status = 'created'
  RETURNING * INTO v;

  IF FOUND THEN
    RETURN v;
  END IF;

  SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada';
  END IF;
  -- Repetir a marcação é no-op (a edge function pode ser reentregue).
  IF v.status = 'sent' THEN
    RETURN v;
  END IF;
  RAISE EXCEPTION 'Não dá pra marcar como enviada uma transferência em %', v.status
    USING ERRCODE = '22023';
END;
$$;

-- 5.3 Confirmação aceita: é AQUI que o dinheiro começa a andar.
CREATE OR REPLACE FUNCTION public.payroll_pix_confirm(
  p_id              uuid,
  p_provider_status text  DEFAULT NULL,
  p_response        jsonb DEFAULT NULL,
  p_http_status     int   DEFAULT NULL
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.payroll_pix_transfers%ROWTYPE;
BEGIN
  UPDATE public.payroll_pix_transfers
     SET status           = 'confirmed',
         confirmed_at     = coalesce(confirmed_at, now()),
         provider_status  = coalesce(p_provider_status, provider_status),
         response_payload = coalesce(p_response, response_payload),
         http_status      = coalesce(p_http_status, http_status),
         last_checked_at  = now(),
         next_check_at    = now() + interval '20 seconds'
   WHERE id = p_id
     AND status = 'sent'
  RETURNING * INTO v;

  IF FOUND THEN
    RETURN v;
  END IF;

  SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada';
  END IF;
  -- 'settled' já passou por aqui; voltar pra 'confirmed' seria andar pra trás.
  IF v.status IN ('confirmed', 'settled') THEN
    RETURN v;
  END IF;
  RAISE EXCEPTION 'Não dá pra confirmar uma transferência em %', v.status
    USING ERRCODE = '22023';
END;
$$;

-- 5.4 Não sabemos. Timeout, 5xx, token vencido no meio da chamada.
--     Este é o estado HONESTO: a alternativa cômoda seria marcar 'failed' e
--     deixar o operador tentar de novo — e é exatamente assim que se paga duas
--     vezes. Daqui só se sai por gente (payroll_pix_resolve_unknown).
CREATE OR REPLACE FUNCTION public.payroll_pix_mark_unknown(
  p_id     uuid,
  p_motivo text
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.payroll_pix_transfers%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Registra o que aconteceu — "unknown" sem motivo não ajuda ninguém a resolver depois'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.payroll_pix_transfers
     SET status          = 'unknown',
         error_code      = coalesce(error_code, 'UNKNOWN'),
         error_message   = v_motivo,
         last_checked_at = now(),
         -- Agenda CONSULTA, não reenvio: o GET pode revelar o endToEnd e
         -- resolver sozinho pro lado bom, sem arriscar um segundo pagamento.
         next_check_at   = now() + interval '1 minute'
   WHERE id = p_id
     AND status IN ('created', 'sent', 'confirmed', 'unknown')
  RETURNING * INTO v;

  IF FOUND THEN
    RETURN v;
  END IF;

  SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada';
  END IF;
  -- Terminal é terminal: liquidada ou recusada não volta pra dúvida.
  RAISE EXCEPTION 'Transferência já está em % — não dá pra marcar como desconhecida', v.status
    USING ERRCODE = '22023';
END;
$$;

-- 5.5 Recusa DETERMINÍSTICA (o banco disse não). Só use quando a resposta do
--     provedor prova que o dinheiro não saiu; qualquer dúvida é mark_unknown.
CREATE OR REPLACE FUNCTION public.payroll_pix_fail(
  p_id          uuid,
  p_code        text,
  p_msg         text,
  p_response    jsonb DEFAULT NULL,
  p_http_status int   DEFAULT NULL
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.payroll_pix_transfers%ROWTYPE;
BEGIN
  UPDATE public.payroll_pix_transfers
     SET status           = 'failed',
         failed_at        = now(),
         error_code       = coalesce(nullif(btrim(coalesce(p_code, '')), ''), 'ERRO'),
         error_message    = p_msg,
         response_payload = coalesce(p_response, response_payload),
         http_status      = coalesce(p_http_status, http_status),
         last_checked_at  = now(),
         next_check_at    = NULL
   WHERE id = p_id
     -- 'unknown' NÃO entra: virar 'failed' a partir da dúvida é decisão humana
     -- (payroll_pix_resolve_unknown), porque é ela que libera nova tentativa.
     AND status IN ('created', 'sent', 'confirmed')
  RETURNING * INTO v;

  IF FOUND THEN
    RETURN v;
  END IF;

  SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada';
  END IF;
  IF v.status = 'failed' THEN
    RETURN v;
  END IF;
  RAISE EXCEPTION 'Não dá pra recusar uma transferência em %', v.status
    USING ERRCODE = '22023';
END;
$$;

-- 5.6 Liquidação: o dinheiro saiu, e temos o endToEnd pra provar.
--     Idempotente dos dois lados — o poller pode entregar o mesmo GET duas
--     vezes, e o pagamento pode já estar marcado à mão pelo financeiro.
CREATE OR REPLACE FUNCTION public.payroll_pix_settle(
  p_transfer_id   uuid,
  p_end_to_end_id text,
  p_settled_at    timestamptz DEFAULT now(),
  p_response      jsonb       DEFAULT NULL
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v    public.payroll_pix_transfers%ROWTYPE;
  v_e2e text := nullif(btrim(coalesce(p_end_to_end_id, '')), '');
BEGIN
  -- Valida o endToEnd ANTES do UPDATE. A CHECK da tabela já barraria, mas com
  -- uma mensagem de constraint que ninguém do financeiro consegue interpretar;
  -- aqui a recusa sai em português e o registro nem chega a ser tocado.
  IF v_e2e IS NULL THEN
    SELECT t.end_to_end_id INTO v_e2e
      FROM public.payroll_pix_transfers t WHERE t.id = p_transfer_id;
    IF v_e2e IS NULL THEN
      RAISE EXCEPTION 'Liquidação sem endToEnd não é liquidação — manda o identificador do PIX'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.payroll_pix_transfers
     SET status           = 'settled',
         end_to_end_id    = v_e2e,
         settled_at       = coalesce(p_settled_at, now()),
         response_payload = coalesce(p_response, response_payload),
         last_checked_at  = now(),
         next_check_at    = NULL
   WHERE id = p_transfer_id
     -- 'unknown' entra: o GET que enfim trouxe o endToEnd é a melhor notícia
     -- possível pra uma transferência em dúvida — ela era boa o tempo todo.
     AND status IN ('sent', 'confirmed', 'unknown')
  RETURNING * INTO v;

  IF NOT FOUND THEN
    SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_transfer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transferência não encontrada';
    END IF;
    IF v.status <> 'settled' THEN
      RAISE EXCEPTION 'Não dá pra liquidar uma transferência em %', v.status
        USING ERRCODE = '22023';
    END IF;
    -- Já estava liquidada: segue pra projeção mesmo assim, porque o que pode
    -- ter falhado da vez anterior é justamente o INSERT em payroll_payments.
  END IF;

  -- Projeção. O ON CONFLICT mira o UNIQUE (entry_id) que payroll_payments já
  -- tem desde 20260505150000. O WHERE do DO UPDATE é a parte importante: se
  -- alguém já marcou pago (à mão ou por outra liquidação), NÃO sobrescrevemos —
  -- a linha fica como está e a divergência aparece na conferência, em vez de
  -- ser apagada por nós.
  INSERT INTO public.payroll_payments (
    company_id, period_id, entry_id, amount, paid_at, paid_by,
    method, settled_transfer_id, notes
  ) VALUES (
    v.company_id, v.period_id, v.entry_id, v.amount, v.settled_at, v.created_by,
    'pix_santander', v.id, 'PIX ' || v.provider || ' · E2E ' || v.end_to_end_id
  )
  ON CONFLICT (entry_id) DO UPDATE
     SET paid_at             = EXCLUDED.paid_at,
         paid_by             = EXCLUDED.paid_by,
         amount              = EXCLUDED.amount,
         company_id          = EXCLUDED.company_id,
         method              = EXCLUDED.method,
         settled_transfer_id = EXCLUDED.settled_transfer_id,
         notes               = coalesce(
                                 nullif(btrim(coalesce(payroll_payments.notes, '')), ''),
                                 EXCLUDED.notes)
   WHERE payroll_payments.paid_at IS NULL;

  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.payroll_pix_settle(uuid, text, timestamptz, jsonb) IS
  'Marca a tentativa como liquidada e projeta em payroll_payments. Idempotente; nunca sobrescreve pagamento já marcado.';

-- 5.7 Saída de 'unknown' — HUMANA, sempre.
--     Nenhum job chama isto. Quem decide "saiu" ou "não saiu" é uma pessoa que
--     olhou o extrato ou falou com o banco, e o motivo escrito fica no registro
--     porque é ele que explica, meses depois, por que se pagou de novo.
CREATE OR REPLACE FUNCTION public.payroll_pix_resolve_unknown(
  p_id     uuid,
  p_status public.pix_transfer_status,
  p_motivo text,
  p_e2e    text DEFAULT NULL,
  p_actor  uuid DEFAULT NULL
)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v        public.payroll_pix_transfers%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_e2e    text := nullif(btrim(coalesce(p_e2e, '')), '');
BEGIN
  -- IS NULL explícito: NULL NOT IN (...) é NULL e passaria direto pro ELSE lá
  -- embaixo, marcando 'failed' sem ninguém ter pedido.
  IF p_status IS NULL OR p_status NOT IN ('settled', 'failed') THEN
    RAISE EXCEPTION 'Resolução de uma transferência desconhecida só termina em settled ou failed'
      USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL OR length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Conta como você verificou (mínimo 5 caracteres) — extrato, protocolo, quem confirmou'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência não encontrada';
  END IF;
  IF v.status <> 'unknown' THEN
    RAISE EXCEPTION 'Essa transferência está em % — não há dúvida pra resolver', v.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.payroll_pix_transfers
     SET resolved_by     = p_actor,
         resolved_reason = v_motivo
   WHERE id = p_id;

  IF p_status = 'settled' THEN
    -- Reusa o settle: mesma trava de endToEnd, mesma projeção idempotente.
    SELECT * INTO v
      FROM public.payroll_pix_settle(p_id, coalesce(v_e2e, v.end_to_end_id), now(), NULL) AS s;
  ELSE
    UPDATE public.payroll_pix_transfers
       SET status        = 'failed',
           failed_at     = now(),
           error_code    = 'RESOLVIDO_MANUALMENTE',
           error_message = v_motivo,
           next_check_at = NULL
     WHERE id = p_id
    RETURNING * INTO v;
  END IF;

  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.payroll_pix_resolve_unknown(uuid, public.pix_transfer_status, text, text, uuid) IS
  'Única saída do estado unknown. Humana por definição: nenhum job automático decide onde o dinheiro parou.';

-- ── Privilégios ─────────────────────────────────────────────────────────────
-- O Postgres concede EXECUTE a PUBLIC na criação e `anon` herda PUBLIC. Sem
-- estes REVOKEs, qualquer um com a anon key do bundle abriria e liquidaria PIX.
REVOKE EXECUTE ON FUNCTION public.payroll_pix_open_transfer(uuid, uuid, text)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_pix_mark_sent(uuid, text, text, jsonb, int)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_pix_confirm(uuid, text, jsonb, int)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_pix_mark_unknown(uuid, text)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_pix_fail(uuid, text, text, jsonb, int)                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_pix_settle(uuid, text, timestamptz, jsonb)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_pix_resolve_unknown(uuid, public.pix_transfer_status, text, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.payroll_pix_open_transfer(uuid, uuid, text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_pix_mark_sent(uuid, text, text, jsonb, int)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_pix_confirm(uuid, text, jsonb, int)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_pix_mark_unknown(uuid, text)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_pix_fail(uuid, text, text, jsonb, int)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_pix_settle(uuid, text, timestamptz, jsonb)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.payroll_pix_resolve_unknown(uuid, public.pix_transfer_status, text, text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — leitura e nada além disso
--    NENHUMA policy de escrita, de propósito: o único caminho de gravação é
--    RPC SECURITY DEFINER chamada com service_role (que ignora RLS). Sem policy
--    de INSERT/UPDATE/DELETE, usuário autenticado não escreve nem com a tabela
--    exposta no PostgREST — mesma decisão de audit_log.
--    Leitura restrita a RH / admin_gc / diretoria: a linha traz chave PIX,
--    documento e valor líquido de pessoa identificada. contador e gestor comum
--    ficam de fora até existir um pedido concreto.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_pix_transfers ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY também não aceita IF NOT EXISTS. DROP antes, mesma razão dos
-- triggers acima.
DROP POLICY IF EXISTS "admin_gc reads all pix transfers" ON public.payroll_pix_transfers;
DROP POLICY IF EXISTS "company reads own pix transfers" ON public.payroll_pix_transfers;

CREATE POLICY "admin_gc reads all pix transfers" ON public.payroll_pix_transfers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('admin_gc', 'admin'))
  );

-- Argumentos na ORDEM CERTA (_user_id, _company_id) — as policies antigas do
-- repo passam invertido e só funcionam pela tolerância criada em 20260616120000.
CREATE POLICY "company reads own pix transfers" ON public.payroll_pix_transfers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('rh', 'diretoria'))
    AND public.user_belongs_to_company(auth.uid(), payroll_pix_transfers.company_id)
  );

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Atenção: derrubar isto APAGA o rastro de PIX já enviados. Se houver linha em
-- payroll_pix_transfers, exporte a tabela antes — payroll_payments guarda só o
-- "pago", não o endToEnd nem a chave pra qual o dinheiro foi.
--
-- ORDEM ENTRE MIGRATIONS: payment_2fa_challenges.transfer_id (20260818120300)
-- referencia payroll_pix_transfers. Se aquela migration estiver aplicada, o
-- rollback DELA roda antes deste — senão o DROP TABLE abaixo bate na FK.
--
-- BEGIN;
--
--   DROP POLICY IF EXISTS "company reads own pix transfers"  ON public.payroll_pix_transfers;
--   DROP POLICY IF EXISTS "admin_gc reads all pix transfers" ON public.payroll_pix_transfers;
--
--   DROP FUNCTION IF EXISTS public.payroll_pix_resolve_unknown(uuid, public.pix_transfer_status, text, text, uuid);
--   DROP FUNCTION IF EXISTS public.payroll_pix_settle(uuid, text, timestamptz, jsonb);
--   DROP FUNCTION IF EXISTS public.payroll_pix_fail(uuid, text, text, jsonb, int);
--   DROP FUNCTION IF EXISTS public.payroll_pix_mark_unknown(uuid, text);
--   DROP FUNCTION IF EXISTS public.payroll_pix_confirm(uuid, text, jsonb, int);
--   DROP FUNCTION IF EXISTS public.payroll_pix_mark_sent(uuid, text, text, jsonb, int);
--   DROP FUNCTION IF EXISTS public.payroll_pix_open_transfer(uuid, uuid, text);
--
--   DROP TRIGGER  IF EXISTS trg_payroll_payments_guard ON public.payroll_payments;
--   DROP FUNCTION IF EXISTS public.payroll_payments_guard();
--
--   DROP INDEX IF EXISTS public.idx_payroll_payments_company;
--   ALTER TABLE public.payroll_payments
--     DROP COLUMN IF EXISTS settled_transfer_id,
--     DROP COLUMN IF EXISTS method,
--     DROP COLUMN IF EXISTS company_id;
--
--   DROP TRIGGER IF EXISTS audit_payroll_pix_transfers          ON public.payroll_pix_transfers;
--   DROP TRIGGER IF EXISTS set_updated_at_payroll_pix_transfers ON public.payroll_pix_transfers;
--   DROP TABLE IF EXISTS public.payroll_pix_transfers;
--   DROP TYPE  IF EXISTS public.pix_transfer_status;
--
-- COMMIT;
