-- Migration: 20260820140000_pix_gateway_credentials.sql
-- Description: credenciais do Santander por ambiente, configuráveis pelo painel.
--   O client_secret é guardado CIFRADO; a chave mora fora do banco (secret do
--   edge PIX_CRED_KEY), então um dump do Postgres não abre o segredo.
--
-- POR QUE ISTO EXISTE
-- O usuário quis configurar tudo pelo painel (sem SSH no env do gateway). Isso
-- move as credenciais do env do container pra cá. O gateway deixa de ler creds
-- do env: passa a recebê-las POR REQUEST, decifradas pelo edge. O gateway guarda
-- só o CERTIFICADO (mTLS), que é o que de fato move dinheiro — sem ele, credencial
-- nenhuma paga (o Akamai barra). Por isso o certificado continua sendo arquivo no
-- volume, e é a única coisa que não se configura pelo painel.
--
-- O QUE É SEGREDO E O QUE NÃO É
-- client_id, workspace_id, base_url e a conta de débito são IDENTIFICADORES de
-- configuração — ficam em texto. O client_secret é o único segredo, e vai
-- CIFRADO (AES-GCM feito no edge). A coluna guarda "iv:ciphertext" em base64 —
-- opaco pro banco, que nunca vê a chave.
--
-- SEM AUDIT TRIGGER (de propósito): audit_log_trigger copia to_jsonb(NEW) inteiro,
-- o que jogaria o ciphertext pra dentro de audit_log de novo. É cifrado, mas
-- espalhar o segredo (mesmo cifrado) é o oposto do que esta tabela quer. A troca
-- de config é registrada pela edge em payment_2fa_events (sem segredo). Mesma
-- decisão de payment_2fa_challenges.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pix_gateway_credentials (
  -- Uma linha por ambiente. environment é a identidade.
  environment          text PRIMARY KEY
                       CHECK (environment IN ('sandbox', 'production')),
  -- Identificadores (não-segredos).
  client_id            text NOT NULL,
  workspace_id         text NOT NULL,
  base_url             text NOT NULL,
  -- Host do comprovante (consult_payment_receipts). Nulo = o edge deriva do
  -- ambiente (trust-open em produção).
  receipts_base_url    text,
  debit_branch         text NOT NULL,
  debit_account        text NOT NULL,
  -- O ÚNICO segredo, CIFRADO no edge (AES-GCM). Formato "iv_b64:ct_b64". O banco
  -- não tem a chave — dump vazado ≠ segredo utilizável.
  client_secret_enc    text NOT NULL,
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pix_gateway_credentials IS
  'Credenciais do Santander por ambiente, configuradas pelo painel. client_secret_enc é AES-GCM (chave no edge, PIX_CRED_KEY, fora do banco). Escrita só por service_role (edge pix-gateway-config). Sem audit trigger: não espalhar o ciphertext.';
COMMENT ON COLUMN public.pix_gateway_credentials.client_secret_enc IS
  'client_secret cifrado (AES-GCM) no edge — formato iv_b64:ct_b64. O banco nunca vê a chave nem o texto plano.';

DROP TRIGGER IF EXISTS trg_pix_gateway_credentials_updated_at ON public.pix_gateway_credentials;
CREATE TRIGGER trg_pix_gateway_credentials_updated_at
  BEFORE UPDATE ON public.pix_gateway_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — NENHUMA policy. RLS ligada + zero policy = anon/authenticated não leem
-- nem escrevem, nem por um select('*') distraído do client. Só service_role (a
-- edge pix-gateway-config, que devolve o segredo MASCARADO) toca aqui. O REVOKE
-- é cinto e suspensório, igual payment_2fa_challenges.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pix_gateway_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pix_gateway_credentials FROM anon, authenticated;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Derrubar isto tira as credenciais do banco; o gateway volta a depender do env
-- (fallback que fica de pé de propósito durante a transição).
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_pix_gateway_credentials_updated_at ON public.pix_gateway_credentials;
--   DROP TABLE IF EXISTS public.pix_gateway_credentials;
-- COMMIT;
