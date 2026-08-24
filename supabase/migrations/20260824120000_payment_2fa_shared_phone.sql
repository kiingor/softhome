-- Migration: 20260824120000_payment_2fa_shared_phone.sql
-- Description: permite que MAIS DE UM pagador cadastre o MESMO celular de
--   confirmação de pagamento (2FA).
--
-- POR QUÊ
-- Operação real: uma pessoa do financeiro recebe os códigos de todos os pagadores
-- num aparelho só (ela tem acesso e conferência). A regra anterior era "um número
-- = um pagador" (índice global uq_payment_2fa_devices_phone), então a segunda
-- pessoa a cadastrar o mesmo número tomava 409 PHONE_IN_USE / 23505.
--
-- O QUE MUDA
-- A unicidade de telefone passa de GLOBAL pra POR USUÁRIO: o mesmo usuário não
-- duplica o próprio número (integridade preservada), mas usuários DIFERENTES podem
-- compartilhar o mesmo celular. O índice "um ATIVO por usuário"
-- (uq_payment_2fa_devices_active_per_user) continua intacto — a partilha é do
-- número, não do vínculo usuário↔aparelho.
--
-- TRADE-OFF DE SEGURANÇA (decisão de produto, aceita)
-- Quem controla o aparelho compartilhado aprova pagamento em nome de qualquer
-- pagador que use aquele número. O 2FA deixa de provar "posse do celular PESSOAL
-- do pagador" e passa a ser "confirmação num aparelho sob guarda do financeiro".
-- Os demais fatores seguem: papel restrito (admin_gc/diretoria) + módulo
-- folha_pagamento_exec + reautenticação por senha no cadastro do aparelho. A
-- rejeição do número REMETENTE da empresa (SAME_AS_SENDER, no edge) também segue.

BEGIN;

-- Sai a unicidade global de telefone…
DROP INDEX IF EXISTS public.uq_payment_2fa_devices_phone;

-- …entra a unicidade por (usuário, telefone). Parcial em pending/active pra que
-- 'revoked' (histórico) não segure o número; mesmo shape do índice antigo, só
-- com user_id na frente. É GUARDA, não alvo de upsert (nenhum caminho usa ON
-- CONFLICT nesta tabela).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_2fa_devices_phone_per_user
  ON public.payment_2fa_devices (user_id, phone)
  WHERE status IN ('pending', 'active');

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Atenção: voltar a unicidade global FALHA se já houver dois pagadores com o
-- mesmo número em pending/active — é o estado que esta migration passou a
-- permitir. Revogar um dos dispositivos duplicados antes de rodar o rollback.
-- BEGIN;
--   DROP INDEX IF EXISTS public.uq_payment_2fa_devices_phone_per_user;
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_2fa_devices_phone
--     ON public.payment_2fa_devices (phone)
--     WHERE status IN ('pending', 'active');
-- COMMIT;
