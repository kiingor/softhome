-- Migration: 20260820130000_pix_environment_settings.sql
-- Description: a flag que decide se o PIX da folha corre em SANDBOX ou PRODUÇÃO,
--   trocável por um painel (com 2FA) em vez de SSH no env do edge-runtime.
--
-- O QUE MUDA vs. hoje
-- Hoje o ambiente vem de Deno.env.get("SANTANDER_ENVIRONMENT") num único ponto
-- (payroll-pix-pay), e trocar exige editar functions-secrets.env + reiniciar o
-- container. Esta tabela move a DECISÃO pro banco: o edge lê a flag daqui, então
-- virar ambiente vira um UPDATE (atrás de papel restrito + 2FA + auditoria), não
-- um deploy.
--
-- O QUE NÃO MUDA (a fronteira de segurança)
-- Os SEGREDOS (client_id/secret/workspace) continuam SÓ no gateway (santander-gw),
-- que passa a guardar os dois conjuntos (SANTANDER_SANDBOX_* / SANTANDER_PROD_*)
-- e escolhe por request pelo campo `environment`. Nada de credencial de banco
-- entra no Postgres. Esta tabela guarda UMA palavra: 'sandbox' ou 'production'.
--
-- ESCOPO: a flag é GLOBAL (o gateway tem um workspace por ambiente pro grupo
-- todo, não por CNPJ), então a tabela é de UMA linha só — o CHECK (id) garante.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. purpose 'env_switch' no 2FA
--    Ligar produção pede um código no WhatsApp do pagador, igual a pagar. Reusa
--    payment_2fa_challenges/consume; só o purpose é novo. transfer_id e
--    batch_transfer_ids ficam NULL (o desafio não paga nada — autoriza o flip),
--    e o CHECK de shape (20260820120000) já aceita isso pro ramo ELSE.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_2fa_challenges
  DROP CONSTRAINT IF EXISTS payment_2fa_challenges_purpose_check;

ALTER TABLE public.payment_2fa_challenges
  ADD CONSTRAINT payment_2fa_challenges_purpose_check
  CHECK (purpose IN ('enroll', 'payment', 'payment_batch', 'env_switch'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pix_environment_settings — a flag, uma linha só
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pix_environment_settings (
  -- Trava de linha única: id é sempre TRUE, e o PK impede um segundo TRUE. Uma
  -- tabela de configuração global não pode ter duas verdades sobre "qual
  -- ambiente está ativo".
  id                          boolean PRIMARY KEY DEFAULT true CHECK (id),
  active_environment          text NOT NULL DEFAULT 'sandbox'
                              CHECK (active_environment IN ('sandbox', 'production')),
  -- Quem virou por último e quando produção foi LIGADA pela primeira vez — a
  -- linha do tempo que o auditor pergunta depois de um incidente.
  updated_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  production_first_enabled_at timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pix_environment_settings IS
  'Flag GLOBAL do ambiente ativo do PIX da folha (sandbox|production). Uma linha (id=true). Segredos NÃO moram aqui — só no gateway. Escrita só por RPC SECURITY DEFINER.';
COMMENT ON COLUMN public.pix_environment_settings.active_environment IS
  'Ambiente que o edge carimba em novas transferências. production = pagamentos REAIS. Trocado por pix_set_active_environment (papel + 2FA na edge).';

-- Nasce em sandbox — o valor que não move dinheiro. ON CONFLICT: reexecução da
-- migration não zera uma flag que já foi pra produção.
INSERT INTO public.pix_environment_settings (id, active_environment)
VALUES (true, 'sandbox')
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_pix_environment_settings_updated_at ON public.pix_environment_settings;
CREATE TRIGGER trg_pix_environment_settings_updated_at
  BEFORE UPDATE ON public.pix_environment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auditoria: trocar o ambiente é evento de segurança. Sem company_id (é global),
-- então a linha do audit nasce com company_id NULL → visível a admin_gc, que é
-- exatamente quem pode trocar. A edge também grava em payment_2fa_events.
DROP TRIGGER IF EXISTS audit_pix_environment_settings ON public.pix_environment_settings;
CREATE TRIGGER audit_pix_environment_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.pix_environment_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — leitura pra quem opera folha; escrita só por RPC
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pix_environment_settings ENABLE ROW LEVEL SECURITY;

-- O nome do ambiente não é segredo — é indicador de modo (a UI mostra o badge
-- SANDBOX/PRODUÇÃO). Leitura liberada pra qualquer autenticado; assim o badge
-- aparece pra quem vê a folha sem precisar de papel especial.
DROP POLICY IF EXISTS "authenticated reads pix environment" ON public.pix_environment_settings;
CREATE POLICY "authenticated reads pix environment" ON public.pix_environment_settings
  FOR SELECT TO authenticated USING (true);

-- Sem policy de INSERT/UPDATE/DELETE: só service_role (via a RPC abaixo) escreve.
-- Um authenticated que pudesse dar UPDATE aqui ligaria produção sem passar pelo
-- 2FA da edge — o flip inteiro viraria decoração.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC de flip — service_role only, chamada pela edge DEPOIS do gate + 2FA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pix_set_active_environment(
  p_env   text,
  p_actor uuid
)
RETURNS public.pix_environment_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pix_environment_settings%ROWTYPE;
BEGIN
  IF coalesce(p_env, '') NOT IN ('sandbox', 'production') THEN
    RAISE EXCEPTION 'Ambiente inválido: %', p_env USING ERRCODE = '22023';
  END IF;

  UPDATE public.pix_environment_settings
     SET active_environment          = p_env,
         updated_by                  = p_actor,
         -- Carimba a PRIMEIRA vez que produção liga — não sobrescreve nas
         -- viradas seguintes.
         production_first_enabled_at = CASE
           WHEN p_env = 'production' AND production_first_enabled_at IS NULL
             THEN now()
           ELSE production_first_enabled_at
         END
   WHERE id = true
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- A linha semente deveria existir (INSERT acima). Se não existir, cria já no
    -- ambiente pedido — melhor do que falhar o flip por linha ausente.
    INSERT INTO public.pix_environment_settings (id, active_environment, updated_by,
      production_first_enabled_at)
    VALUES (true, p_env, p_actor,
      CASE WHEN p_env = 'production' THEN now() ELSE NULL END)
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.pix_set_active_environment(text, uuid) IS
  'Troca o ambiente ativo do PIX. service_role only — a edge pix-env-switch aplica papel + 2FA ANTES de chamar. Ligar produção sem esse caminho é impossível pra authenticated.';

-- Funções nascem com EXECUTE pra PUBLIC; o REVOKE é obrigatório (senão anon com
-- a chave do bundle ligaria produção).
REVOKE EXECUTE ON FUNCTION public.pix_set_active_environment(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pix_set_active_environment(text, uuid)
  TO service_role;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.pix_set_active_environment(text, uuid);
--   DROP TRIGGER IF EXISTS audit_pix_environment_settings          ON public.pix_environment_settings;
--   DROP TRIGGER IF EXISTS trg_pix_environment_settings_updated_at ON public.pix_environment_settings;
--   DROP TABLE IF EXISTS public.pix_environment_settings;
--   -- volta o purpose ao trio anterior (encerra desafios env_switch em aberto):
--   DELETE FROM public.payment_2fa_challenges WHERE purpose = 'env_switch';
--   ALTER TABLE public.payment_2fa_challenges
--     DROP CONSTRAINT IF EXISTS payment_2fa_challenges_purpose_check;
--   ALTER TABLE public.payment_2fa_challenges
--     ADD CONSTRAINT payment_2fa_challenges_purpose_check
--     CHECK (purpose IN ('enroll', 'payment', 'payment_batch'));
-- COMMIT;
