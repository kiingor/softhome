-- Migration: 20260818120000_pix_key_type_and_normalizer.sql
-- Description: dá TIPO e FORMA NORMALIZADA à chave PIX do colaborador.
--
-- PORQUÊ: `collaborators.pix_key` nasceu texto livre — o COMMENT de
-- 20260508120000 admite isso na cara ("Sem validação rígida no banco") porque o
-- campo só existia pro RH copiar e colar no internet banking. O ADR 0006 mudou o
-- requisito: o Santander exige `dictCodeType` (EMAIL/CPF/CNPJ/PHONE/EVP) no
-- corpo do pagamento e recusa chave sem tipo declarado. Sem classificação no
-- banco, o tipo seria adivinhado na hora de pagar — na operação mais
-- irreversível do sistema, onde um PIX enviado não volta.
--
-- POR QUE COLUNA GERADA (e não coluna comum + trigger + backfill): coluna
-- GENERATED ... STORED é a única forma que NÃO admite drift. O RH corrige a
-- chave na tela e a classificação se refaz na mesma escrita — sem job noturno,
-- sem migration de dado, sem "esqueci de rodar o backfill". Por isso esta
-- migration não tem UPDATE nenhum: as ~300 linhas existentes são recalculadas
-- pelo próprio ADD COLUMN, que reescreve a tabela.
--
-- ESCOPO: classificar e normalizar. Esta migration NÃO valida dígito
-- verificador de CPF/CNPJ nem consulta o DICT — chave sintaticamente perfeita
-- pode simplesmente não existir. Quem decide se dá pra pagar é o gateway
-- (santander-gw); aqui a regra é só "esta chave é classificável?".

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O tipo
--    Labels em minúsculo pra casar com o resto do schema (snake_case, inglês).
--    O mapa pro Santander é `upper(pix_key_type)` — EMAIL/CPF/CNPJ/PHONE/EVP —
--    e vive no gateway, não aqui: se o banco mudar o vocabulário dele, a gente
--    troca o mapa, não o dado de 300 colaboradores.
--
--    Criar o tipo e usar os labels na MESMA transação é seguro: a armadilha de
--    "unsafe use of new value of enum type" (que mordeu 20260727120100) só vale
--    pra ALTER TYPE ... ADD VALUE em tipo preexistente.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- CREATE TYPE não aceita IF NOT EXISTS; sem esta guarda a migration não é
  -- reexecutável em ambiente que já recebeu ela pela metade.
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'pix_key_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.pix_key_type AS ENUM ('cpf', 'cnpj', 'email', 'phone', 'evp');
  END IF;
END $$;

COMMENT ON TYPE public.pix_key_type IS
  'Tipo de chave PIX (DICT). Espelha o dictCodeType do Santander em minúsculo — a conversão é upper() no gateway (ADR 0006).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Classificador
--    IMMUTABLE porque é requisito de coluna gerada, e é honesto: a resposta
--    depende só dos dois argumentos.
--    NÃO é SECURITY DEFINER de propósito — a função não toca em tabela nenhuma,
--    então definer só aumentaria superfície. O search_path fica preso mesmo
--    assim: com ela dentro de uma coluna gerada, quem dispara a execução é
--    qualquer INSERT/UPDATE em collaborators, inclusive de sessão hostil.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pix_key_type(p_key text, p_cpf text)
RETURNS public.pix_key_type
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw        text := btrim(coalesce(p_key, ''));
  v_digits     text;
  v_cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
BEGIN
  -- Chave vazia/nula não é erro: é cadastro incompleto, que o RH resolve depois.
  -- Devolver NULL (e não estourar) mantém a coluna gerada gravável pra todo
  -- mundo — inclusive pros colaboradores que a sync importa sem PIX.
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- E-mail primeiro: é o único formato que pode conter dígitos e ainda assim
  -- não ser número nenhum. Regex simples de propósito (tem @, tem ponto no
  -- domínio, não tem espaço) — validar e-mail "de verdade" por regex é ilusão.
  IF v_raw ~ '^[^@[:space:]]+@[^@[:space:]]+\.[A-Za-z]{2,}$' THEN
    RETURN 'email';
  END IF;

  -- EVP (chave aleatória) é UUID v4 pela especificação do BCB. Cobramos a
  -- versão e a variante: um UUID de outra versão aqui é quase certamente algo
  -- que não veio do DICT.
  IF lower(v_raw) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN 'evp';
  END IF;

  -- Daqui pra baixo a chave só pode ser numérica. Aceitamos a pontuação que o
  -- humano digita (123.456.789-09, (11) 98765-4321, +55 11 ...); qualquer letra
  -- sobrando significa que não é CPF/CNPJ/telefone — e é melhor devolver NULL
  -- do que classificar errado.
  IF v_raw !~ '^\+?[-0-9 ()./]+$' THEN
    RETURN NULL;
  END IF;

  v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');

  -- DESEMPATE CRÍTICO — 11 dígitos é CPF **ou** celular, e a forma não decide:
  -- os dois são 11 dígitos. A regra é comparar com o CPF do próprio
  -- colaborador: determinística, auditável e explicável numa reunião ("o
  -- sistema disse CPF porque bate com o CPF dele").
  --
  -- CONSEQUÊNCIA CONHECIDA, de propósito: colaborador com `cpf` NULL (a coluna
  -- virou nullable em 20260525143000 pra sync) e chave de 11 dígitos cai em
  -- 'phone'. Não há como desempatar sem inventar heurística. Isso é RISCO REAL
  -- de pagamento: se a chave era o CPF dele, o gateway vai procurar no DICT um
  -- telefone que pode pertencer a OUTRA pessoa. Mitigação é de produto, não de
  -- schema: quem for pagar precisa ter CPF cadastrado. Um CHECK aqui travaria a
  -- sync, que é justamente quem cria essas linhas incompletas.
  IF length(v_digits) = 11 THEN
    IF length(v_cpf_digits) = 11 AND v_cpf_digits = v_digits THEN
      RETURN 'cpf';
    END IF;
    RETURN 'phone';
  END IF;

  IF length(v_digits) = 14 THEN
    RETURN 'cnpj';
  END IF;

  -- 10 dígitos = DDD + fixo. 12/13 com 55 na frente = o mesmo número já com
  -- DDI. Um 12/13 que NÃO começa com 55 seria telefone estrangeiro: cai no
  -- NULL do fim, porque folha de CLT com chave de fora do Brasil é bem mais
  -- provável ser erro de digitação do que caso real.
  IF length(v_digits) = 10
     OR (length(v_digits) IN (12, 13) AND left(v_digits, 2) = '55') THEN
    RETURN 'phone';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.pix_key_type(text, text) IS
  'Classifica a chave PIX. NULL = não classificável (vazia ou fora dos formatos do DICT). O 2º argumento é o CPF do colaborador e existe só pra desempatar os 11 dígitos: bate com o CPF dele → cpf; senão → phone. Sem CPF cadastrado, 11 dígitos viram phone.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Normalizador
--    O DICT casa chave por igualdade exata. "  Fulano@Gmail.com " e
--    "fulano@gmail.com" são a mesma chave pro humano e chaves diferentes pro
--    Santander. Normalizar no banco (e não no cliente que monta o payload)
--    garante que TODO caminho de pagamento mande a mesma string — hoje o
--    gateway, amanhã um relatório ou uma exportação.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pix_key_normalized(p_key text, p_cpf text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_raw    text := btrim(coalesce(p_key, ''));
  v_type   public.pix_key_type := public.pix_key_type(p_key, p_cpf);
  v_digits text := regexp_replace(v_raw, '[^0-9]', '', 'g');
BEGIN
  -- Não classificou, não normaliza. As duas colunas ficam NULL juntas: "chave
  -- pronta pra pagar" vira um teste só (pix_key_type IS NOT NULL).
  IF v_type IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN CASE v_type
    -- CPF/CNPJ vão só com dígitos: o DICT não guarda a máscara.
    WHEN 'cpf'   THEN v_digits
    WHEN 'cnpj'  THEN v_digits
    -- Chave de e-mail no DICT é case-insensitive e sempre armazenada em caixa
    -- baixa; mandar como o RH digitou é pedir "chave não encontrada".
    WHEN 'email' THEN lower(v_raw)
    WHEN 'evp'   THEN lower(v_raw)
    -- Telefone é E.164: + DDI DDD número, sem pontuação. Se o RH já digitou o
    -- 55 na frente, não duplicamos.
    WHEN 'phone' THEN '+55' || CASE
                        WHEN length(v_digits) IN (12, 13) AND left(v_digits, 2) = '55'
                          THEN substr(v_digits, 3)
                        ELSE v_digits
                      END
  END;
END;
$$;

COMMENT ON FUNCTION public.pix_key_normalized(text, text) IS
  'Chave PIX no formato exato que vai pro DICT: CPF/CNPJ só dígitos, telefone em E.164 (+55...), e-mail e EVP em minúsculas. NULL quando pix_key_type() não classifica.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. As colunas
--    Coluna gerada só aceita função IMMUTABLE e só enxerga colunas da MESMA
--    linha — que é exatamente o caso (pix_key e cpf). Nada de subquery aqui: o
--    desempate do CPF tem que vir da própria linha, senão a coluna nem é
--    criável.
--
--    PEGADINHA pra quem for mexer depois: CREATE OR REPLACE nas funções acima
--    NÃO recalcula o que já está gravado — STORED é congelado na escrita. Mudou
--    a regra de classificação? Force a reescrita com
--    `UPDATE public.collaborators SET pix_key = pix_key;`.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS pix_key_type public.pix_key_type
    GENERATED ALWAYS AS (public.pix_key_type(pix_key, cpf)) STORED,
  ADD COLUMN IF NOT EXISTS pix_key_normalized text
    GENERATED ALWAYS AS (public.pix_key_normalized(pix_key, cpf)) STORED;

COMMENT ON COLUMN public.collaborators.pix_key_type IS
  'Tipo da chave PIX, derivado de pix_key + cpf. Coluna GERADA: read-only, nunca dessincroniza. NULL = chave ausente ou não classificável → o pagamento tem que ser bloqueado na tela, não adivinhado.';

COMMENT ON COLUMN public.collaborators.pix_key_normalized IS
  'pix_key na forma exata que vai pro DICT (vira dictCode no Santander — ADR 0006). Coluna GERADA. Use ESTA no pagamento, nunca pix_key crua: o DICT casa por igualdade exata.';

-- pix_key continua sendo o campo do humano; só o COMMENT desatualizou.
COMMENT ON COLUMN public.collaborators.pix_key IS
  'Chave PIX como o RH digitou (com máscara, do jeito que o colaborador mandou). É a fonte editável; o tipo e a forma canônica saem dela em pix_key_type / pix_key_normalized.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permissões
--    Sem tabela nova, sem RLS nova: colunas geradas herdam as policies de
--    collaborators, e como são derivadas de pix_key/cpf não expõem nada que
--    quem já lê a linha não visse. Idem audit_log — o trigger de collaborators
--    serializa a linha inteira e pix_key/cpf já estavam lá.
--    As funções são chamadas pela coluna gerada (com os privilégios de quem
--    escreve), mas o front também vai querer pré-visualizar o tipo na tela de
--    cadastro antes de salvar.
--
--    REVOKE ANTES DO GRANT — padrão da casa desde 20260814100400: o Postgres
--    concede EXECUTE a PUBLIC em toda função na criação, e `anon` herda PUBLIC.
--    Um GRANT pra authenticated sem o REVOKE não restringe nada: quem tem a anon
--    key (que está no bundle do frontend, por design) continuaria chamando. Aqui
--    o risco é menor que o de uma RPC de escrita — as duas funções são puras e
--    não tocam tabela — mas classificador de chave PIX exposto pra anon é
--    superfície gratuita, e a exceção ao padrão viraria precedente.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.pix_key_type(text, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pix_key_normalized(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pix_key_type(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pix_key_normalized(text, text) TO authenticated;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- A ORDEM importa: as colunas geradas criam dependência (pg_depend) nas
-- funções, e a coluna pix_key_type depende do enum. Dropar fora de ordem falha
-- com "cannot drop ... because other objects depend on it".
--
-- Os REVOKE/GRANT não têm linha própria aqui: privilégio de função morre junto
-- com a função, e o DROP abaixo leva os dois embora.
--
-- BEGIN;
--   ALTER TABLE public.collaborators
--     DROP COLUMN IF EXISTS pix_key_normalized,
--     DROP COLUMN IF EXISTS pix_key_type;
--
--   DROP FUNCTION IF EXISTS public.pix_key_normalized(text, text);
--   DROP FUNCTION IF EXISTS public.pix_key_type(text, text);
--
--   DROP TYPE IF EXISTS public.pix_key_type;
--
--   -- COMMENT original de 20260508120000:
--   COMMENT ON COLUMN public.collaborators.pix_key IS
--     'Chave PIX do colaborador. Free text — aceita CPF, CNPJ, e-mail, telefone ou chave aleatória. Sem validação rígida no banco.';
-- COMMIT;
--
-- Nada de dado se perde: pix_key nunca foi tocada, e as duas colunas eram
-- derivadas dela.
