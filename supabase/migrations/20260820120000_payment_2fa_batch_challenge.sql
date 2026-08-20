-- Migration: 20260820120000_payment_2fa_batch_challenge.sql
-- Description: um único código de 2FA autoriza um LOTE de transferências PIX da
--   folha (pagamento em lote), sem afrouxar a garantia central do desenho.
--
-- POR QUE ISTO EXISTE
-- Até aqui cada código de pagamento nasce amarrado a UMA transferência
-- (payment_2fa_challenges.transfer_id) — o "trap-door" que impede um código
-- pedido pra pagar R$ 50 de autorizar um pagamento de R$ 50.000. O financeiro
-- pediu selecionar vários colaboradores e pagar todos com UM código só. Isso é
-- exatamente o cenário que o desenho já previa em 20260818120200/300 ("o desafio
-- passaria a apontar para um conjunto"): a UNIDADE ATÔMICA continua sendo UMA
-- transferência (as RPCs open/mark_sent/confirm/settle/fail não mudam), o lote é
-- só um LAÇO depois de um código. O que muda é a AUTORIZAÇÃO: um desafio passa a
-- poder apontar pra um conjunto FIXO de transferências.
--
-- COMO A GARANTIA CENTRAL SOBREVIVE
-- O código de lote autoriza EXATAMENTE o conjunto gravado em batch_transfer_ids,
-- congelado no momento em que o desafio nasce. A edge function de execução NÃO
-- recebe a lista do cliente — ela paga os ids que estão no desafio. Ou seja: um
-- código de lote não pode ser redirecionado pra pagar outra coisa, do mesmo
-- jeito que hoje transfer_id não pode. O cliente só manda { challenge_id, code }.
--
-- O QUE NÃO MUDA (de propósito)
--   • payment_2fa_consume_challenge continua idêntica — o consumo atômico do
--     código é o coração da defesa contra corrida/duplo-clique, e mexer nele
--     seria arriscar o que já está provado. Ela devolve transfer_id (NULL no
--     lote); quem precisa do conjunto lê batch_transfer_ids ANTES de consumir
--     (a coluna é imutável depois do INSERT, então ler antes é seguro).
--   • payroll_pix_transfers e suas RPCs — nenhuma linha. O lote reusa
--     payroll_pix_open_transfer por entry, e o mesmo POST+PATCH por transferência.
--
-- IDEMPOTÊNCIA: guardas (IF NOT EXISTS, DROP ... IF EXISTS) porque este projeto
-- já teve deploy pela metade — reexecutar a migration inteira é cenário real.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. purpose ganha 'payment_batch'
--    O CHECK inline nasceu como payment_2fa_challenges_purpose_check
--    (convenção <tabela>_<coluna>_check do Postgres). Dropar IF EXISTS e recriar
--    NOMEADO deixa a regra explícita e a migration reexecutável.
--
--    'payment_batch' é purpose PRÓPRIO, não um 'payment' com flag: a RPC de
--    consumo exige o purpose esperado, então um código de lote não consome como
--    pagamento avulso e vice-versa — a mesma barreira que separa 'enroll' de
--    'payment'.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_2fa_challenges
  DROP CONSTRAINT IF EXISTS payment_2fa_challenges_purpose_check;

ALTER TABLE public.payment_2fa_challenges
  ADD CONSTRAINT payment_2fa_challenges_purpose_check
  CHECK (purpose IN ('enroll', 'payment', 'payment_batch'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. batch_transfer_ids — o conjunto que o código autoriza
--    NULL em todo desafio 'enroll'/'payment'; preenchido só no 'payment_batch'.
--    É o análogo de transfer_id pro lote: a lista CONGELADA de transferências
--    que este código, e só ele, pode liquidar.
--
--    Sem FK (uuid[] não referencia): a integridade referencial de cada elemento
--    é conferida na execução (a edge lê cada transfer e checa status/empresa
--    antes de pagar). O ON DELETE CASCADE de transfer_id cobre o desafio avulso;
--    aqui, se uma transferência do lote for apagada (só possível via
--    service_role, e barrado por RESTRICT nas FKs de payroll_pix_transfers), o
--    elemento vira um id órfão que a execução simplesmente pula.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_2fa_challenges
  ADD COLUMN IF NOT EXISTS batch_transfer_ids uuid[];

COMMENT ON COLUMN public.payment_2fa_challenges.batch_transfer_ids IS
  'Conjunto FIXO de payroll_pix_transfers que um desafio de purpose=payment_batch autoriza. NULL nos demais purposes. A execução paga exatamente estes ids — o cliente não manda a lista, então o código não pode ser redirecionado.';

-- Guarda de coerência: batch_transfer_ids só existe no lote, e o lote SEMPRE tem
-- pelo menos uma transferência (código que não paga nada é lixo que gasta a
-- instância de WhatsApp). transfer_id e batch_transfer_ids são mutuamente
-- exclusivos — um desafio é avulso OU de lote, nunca os dois.
ALTER TABLE public.payment_2fa_challenges
  DROP CONSTRAINT IF EXISTS payment_2fa_challenges_batch_shape_check;

ALTER TABLE public.payment_2fa_challenges
  ADD CONSTRAINT payment_2fa_challenges_batch_shape_check
  CHECK (
    CASE
      WHEN purpose = 'payment_batch' THEN
        batch_transfer_ids IS NOT NULL
        -- cardinality (não array_length): array vazio dá 0, não NULL, então um
        -- conjunto vazio REPROVA aqui em vez de escapar por NULL >= 1.
        AND cardinality(batch_transfer_ids) >= 1
        AND transfer_id IS NULL
      ELSE
        batch_transfer_ids IS NULL
    END
  );

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Só é seguro se NÃO houver desafio de lote consumido cujo histórico importe —
-- os desafios são efêmeros (TTL de minutos), então na prática rodar isto fora de
-- um dia de folha não perde nada relevante. Volta o CHECK ao par original.
--
-- BEGIN;
--   ALTER TABLE public.payment_2fa_challenges
--     DROP CONSTRAINT IF EXISTS payment_2fa_challenges_batch_shape_check;
--   -- Desafios de lote em aberto violariam o CHECK antigo; encerra-os antes.
--   UPDATE public.payment_2fa_challenges
--      SET expires_at = now(), consumed_at = coalesce(consumed_at, now())
--    WHERE purpose = 'payment_batch';
--   DELETE FROM public.payment_2fa_challenges WHERE purpose = 'payment_batch';
--   ALTER TABLE public.payment_2fa_challenges
--     DROP CONSTRAINT IF EXISTS payment_2fa_challenges_purpose_check;
--   ALTER TABLE public.payment_2fa_challenges
--     ADD CONSTRAINT payment_2fa_challenges_purpose_check
--     CHECK (purpose IN ('enroll', 'payment'));
--   ALTER TABLE public.payment_2fa_challenges
--     DROP COLUMN IF EXISTS batch_transfer_ids;
-- COMMIT;
