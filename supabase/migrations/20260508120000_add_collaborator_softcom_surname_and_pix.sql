-- Migration: 20260508120000_add_collaborator_softcom_surname_and_pix.sql
-- Description: adiciona "Sobrenome Softcom" (apelido/nome interno) e a chave
-- PIX estruturada no cadastro de colaborador. Hoje a chave PIX só era coletada
-- como documento de texto durante a admissão; promovemos pra campo dedicado
-- pra ser exibido na aba Pagamentos da folha (com botão de copiar).

BEGIN;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS softcom_surname text,
  ADD COLUMN IF NOT EXISTS pix_key text;

COMMENT ON COLUMN public.collaborators.softcom_surname IS
  'Apelido/identificador interno do colaborador na Softcom (ex: "Lucas P." pra diferenciar de outro Lucas).';

COMMENT ON COLUMN public.collaborators.pix_key IS
  'Chave PIX do colaborador. Free text — aceita CPF, CNPJ, e-mail, telefone ou chave aleatória. Sem validação rígida no banco.';

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.collaborators
--   DROP COLUMN IF EXISTS softcom_surname,
--   DROP COLUMN IF EXISTS pix_key;
-- COMMIT;
