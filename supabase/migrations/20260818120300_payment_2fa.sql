-- Migration: 20260818120300_payment_2fa.sql
-- Description: fundação do segundo fator para PAGAMENTO — cadastro do celular
--   do pagador (enrollment) e o motor de desafio/consumo de código.
--
-- REGRA DE PRODUTO: quem tem permissão de pagar cadastra o PRÓPRIO celular; o
-- sistema manda um código pela instância de WhatsApp DA EMPRESA (o número
-- remetente é da Softcom, não do pagador) e só considera o aparelho provado
-- quando o código volta. Depois disso, todo pagamento pede um código nesse
-- mesmo aparelho.
--
-- ESCOPO DESTA MIGRATION: só o CADASTRO. O desafio de pagamento (purpose =
-- 'payment', ligado a uma transferência) reusa as mesmas tabelas e a mesma RPC
-- de consumo, mas entra numa PR seguinte — por isso `purpose` já nasce com os
-- dois valores no CHECK e `transfer_id` já existe, nulo por enquanto.
--
-- MODELO DE AMEAÇA (o que estas tabelas assumem):
--   • Sessão roubada NÃO basta pra trocar o celular do 2FA — a edge function de
--     enroll reautentica com senha. Isso é código, não schema, mas é o motivo
--     de nenhuma destas tabelas ter policy de ESCRITA: quem escreve é sempre a
--     edge function com service_role, que passou pelos checks certos. Se o
--     client pudesse dar INSERT direto, o atacante com o JWT na mão cadastraria
--     o próprio número e o 2FA viraria enfeite.
--   • O código em claro NUNCA toca o banco: guardamos HMAC-SHA256 com pepper
--     que só existe como secret da edge function (PAYMENT_2FA_PEPPER). Dump do
--     Postgres vazado ≠ códigos utilizáveis.
--   • O telefone completo fica em payment_2fa_devices (é PII, tem audit
--     trigger). Em qualquer outro lugar — eventos, respostas de API, tela — só
--     circula o last4.
--
-- Fora do escopo de propósito: notification_logs. Ela grava a mensagem EM
-- CLARO, então as funções de 2FA não escrevem nela — o código apareceria em
-- texto puro pra qualquer admin da empresa.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. payment_2fa_devices — o aparelho provado de cada pagador
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_2fa_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- auth.users e não collaborators: quem paga é um USUÁRIO do sistema, e nem
  -- todo usuário com permissão de financeiro tem ficha de colaborador.
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Denormalizado de propósito: é a empresa cuja instância de WhatsApp mandou
  -- o código, é o recorte da RLS e é o que faz o audit_log_trigger conseguir
  -- preencher company_id (ele lê to_jsonb(NEW)->>'company_id'). Sem essa
  -- coluna a linha do audit ficaria sem empresa e só admin_gc enxergaria.
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Normalizado como o resto da casa: só dígitos, com 55 na frente, sem '+'.
  -- O CHECK repete a regra no banco porque um telefone torto aqui significa
  -- código enviado pro número errado — falha silenciosa e cara.
  phone          text NOT NULL CHECK (phone ~ '^55[0-9]{10,11}$'),
  -- Derivada: a UI e os eventos só podem mostrar o final. Sendo GENERATED, não
  -- tem como driftar do telefone real nem ser forjada por quem escreve.
  phone_last4    text GENERATED ALWAYS AS (right(phone, 4)) STORED,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'revoked')),
  verified_at    timestamptz,
  -- Quando o aparelho passa a VALER pra autorizar pagamento. Na primeira vez é
  -- igual ao verified_at; numa TROCA de número fica 60 min à frente. Esse
  -- atraso é a defesa contra o golpe clássico de SIM swap: o atacante troca o
  -- número e paga no mesmo minuto. Com a janela, o dono legítimo ainda recebe
  -- o aviso e tem tempo de revogar.
  active_from    timestamptz,
  -- Trava temporária por erro repetido de código. Fica NULL neste PR: quem
  -- preenche é o desafio de PAGAMENTO, na PR seguinte.
  locked_until   timestamptz,
  revoked_at     timestamptz,
  revoked_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_2fa_devices IS
  'Celular provado por posse de cada pagador. Escrita EXCLUSIVA de service_role (edge functions payment-2fa-*): não existe policy de INSERT/UPDATE/DELETE, e isso é intencional.';
COMMENT ON COLUMN public.payment_2fa_devices.active_from IS
  'A partir de quando o aparelho autoriza pagamento. Numa troca de número fica now() + 60 min (janela anti-SIM-swap).';

-- O DISPOSITIVO É POR USUÁRIO, GLOBAL — não por empresa.
-- É o celular DA PESSOA, não da filial: a mesma pessoa que paga na matriz e na
-- filial carrega um aparelho só. Os dois índices abaixo precisam concordar com
-- essa definição, senão o multi-CNPJ vira armadilha: com unicidade por usuário
-- global de um lado e por (company_id, phone) do outro, cadastrar o MESMO
-- celular numa segunda empresa passaria pelo índice de telefone, e a ativação
-- revogaria em silêncio o aparelho já provado da primeira — jogando o pagador
-- na janela anti-SIM-swap de 60 min sem que ele tenha trocado de aparelho.
-- company_id continua na tabela (recorte de RLS, instância de WhatsApp que
-- enviou, carimbo do audit_log), só não participa mais da identidade.
--
-- Precisam ser índices PARCIAIS (o Postgres não tem constraint UNIQUE com
-- WHERE), e aqui isso não custa nada: nenhum caminho de escrita usa ON CONFLICT
-- nesta tabela — a armadilha documentada em 20260518182932 (partial index não
-- serve de target de upsert do supabase-js) não se aplica. Estes dois índices
-- são GUARDA, não alvo.

-- Um dispositivo ATIVO por pessoa, em qualquer empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_2fa_devices_active_per_user
  ON public.payment_2fa_devices (user_id)
  WHERE status = 'active';

-- Dois pagadores não dividem o mesmo número — em empresa nenhuma. Se
-- dividissem, quem controla o aparelho aprovaria pagamento em nome do colega, e
-- recortar por company_id não ajudaria: o WhatsApp que recebe o código é o
-- mesmo aparelho, não sabe de CNPJ. Histórico ('revoked') fica de fora do
-- predicado pra que o número possa ser reaproveitado depois.
--
-- O DROP é pro ambiente que já tenha recebido a versão anterior deste arquivo
-- (por company_id + phone): sem ele, os dois índices conviveriam e o mais frouxo
-- ficaria de enfeite, escondendo que a regra mudou.
DROP INDEX IF EXISTS public.uq_payment_2fa_devices_phone_per_company;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_2fa_devices_phone
  ON public.payment_2fa_devices (phone)
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_payment_2fa_devices_user
  ON public.payment_2fa_devices (user_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_2fa_devices_company
  ON public.payment_2fa_devices (company_id, status);

DROP TRIGGER IF EXISTS trg_payment_2fa_devices_updated_at ON public.payment_2fa_devices;
CREATE TRIGGER trg_payment_2fa_devices_updated_at
  BEFORE UPDATE ON public.payment_2fa_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PII: número de celular pessoal de pessoa identificada (CLAUDE.md princípio 1).
DROP TRIGGER IF EXISTS audit_payment_2fa_devices ON public.payment_2fa_devices;
CREATE TRIGGER audit_payment_2fa_devices
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_2fa_devices
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. payment_2fa_challenges — os códigos em voo
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela SECRETA. Guarda o hash do código: quem lê uma linha aqui não consegue
-- o código (falta o pepper), mas consegue montar um oráculo offline se também
-- tiver o pepper. Por isso: zero policy, zero GRANT, zero audit trigger.
CREATE TABLE IF NOT EXISTS public.payment_2fa_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'enroll' = provar posse do celular. 'payment' = autorizar uma transferência
  -- (PR seguinte). A RPC de consumo exige o purpose esperado justamente pra que
  -- um código pedido pra cadastrar NÃO sirva pra pagar.
  purpose      text NOT NULL CHECK (purpose IN ('enroll', 'payment')),
  -- Hoje só 'whatsapp'. Coluna existe pra que trocar/adicionar canal (SMS,
  -- TOTP) não vire migration de emergência no dia em que a Evolution cair.
  factor_type  text NOT NULL DEFAULT 'whatsapp',
  device_id    uuid REFERENCES public.payment_2fa_devices(id) ON DELETE CASCADE,
  -- Com FK desde já: payroll_pix_transfers é criada em 20260818120200, que roda
  -- ANTES desta (as migrations aplicam em ordem de nome). Fica NULL enquanto só
  -- existe o purpose 'enroll'; o desafio de 'payment' preenche.
  -- ON DELETE CASCADE porque o desafio não tem vida própria: sem a
  -- transferência que ele autorizaria, é lixo — e lixo que carrega code_hash é
  -- exatamente o que não interessa deixar pra trás.
  transfer_id  uuid REFERENCES public.payroll_pix_transfers(id) ON DELETE CASCADE,
  -- Salt por desafio: dois desafios com o mesmo código de 6 dígitos geram
  -- hashes diferentes, então ninguém compara linhas pra descobrir repetição.
  salt         text NOT NULL,
  -- HMAC-SHA256(PAYMENT_2FA_PEPPER, salt || ':' || code), em hex.
  -- 6 dígitos são só 1 milhão de possibilidades: hash sem pepper seria
  -- quebrado por força bruta em segundos. O pepper mora fora do banco.
  code_hash    text NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  failed_at    timestamptz,
  -- Só o final. Serve pra tela dizer "mandamos pro ****1234" sem que a resposta
  -- da API carregue o número inteiro.
  sent_to_last4 text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- A linha É mutada (consumed_at, attempts, failed_at), então updated_at é
  -- obrigatório pela convenção da casa. Aqui ele ganha uso concreto: numa
  -- investigação de "esse código foi usado ou só chutaram nele?", created_at
  -- diz quando o desafio nasceu e updated_at quando alguém mexeu por último —
  -- inclusive nas tentativas erradas, que não deixam rastro no audit_log
  -- (esta tabela não tem audit trigger, de propósito: ela guarda code_hash).
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_2fa_challenges IS
  'Códigos de 2FA em voo (hash + salt). Tabela secreta: RLS ligada SEM nenhuma policy e sem GRANT pra anon/authenticated. NUNCA adicionar à publication supabase_realtime — realtime entrega a linha inteira, incluindo code_hash, pro client.';

DROP TRIGGER IF EXISTS trg_payment_2fa_challenges_updated_at ON public.payment_2fa_challenges;
CREATE TRIGGER trg_payment_2fa_challenges_updated_at
  BEFORE UPDATE ON public.payment_2fa_challenges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payment_2fa_challenges_user_open
  ON public.payment_2fa_challenges (user_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_2fa_challenges_expiry
  ON public.payment_2fa_challenges (expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. payment_2fa_events — trilha de segurança legível
-- ─────────────────────────────────────────────────────────────────────────────
-- Existe além do audit_log porque o audit_log só enxerga MUDANÇA DE LINHA:
-- "senha errada na tentativa de cadastro" e "código errado" não mudam linha
-- nenhuma e sumiriam. É aqui que se responde "quem tentou trocar o celular do
-- pagamento e falhou".
CREATE TABLE IF NOT EXISTS public.payment_2fa_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       text NOT NULL,
  -- REGRA DURA: metadata NUNCA guarda o código nem o telefone completo. Só
  -- last4, ids e motivo. Esta tabela é lida por admin_gc e pelo próprio dono —
  -- é área de exibição, não cofre.
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  -- Sem updated_at: ver a exceção registrada no COMMENT ON TABLE abaixo.
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_2fa_events IS
  'Trilha append-only do 2FA de pagamento (tentativas, envios, trocas de aparelho). metadata nunca contém código nem telefone completo — só last4. EXCEÇÃO CONSCIENTE à convenção da casa: não tem updated_at nem trigger de updated_at, porque a linha nunca é atualizada — evento de segurança que muda depois de gravado não é trilha, é rascunho. Um updated_at aqui só daria a impressão de que editar é um caminho previsto.';

CREATE INDEX IF NOT EXISTS idx_payment_2fa_events_user
  ON public.payment_2fa_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_2fa_events_company
  ON public.payment_2fa_events (company_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_2fa_devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_2fa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_2fa_events     ENABLE ROW LEVEL SECURITY;

-- devices — SÓ LEITURA, e só de quem tem o que ver com a linha.
-- Note quem NÃO entra: rh e gestor_gc. Ver o celular de 2FA de um pagador é o
-- primeiro passo de um ataque de engenharia social; nem o RH precisa disso.
DROP POLICY IF EXISTS "user reads own 2fa device"    ON public.payment_2fa_devices;
DROP POLICY IF EXISTS "admin_gc reads all 2fa devices" ON public.payment_2fa_devices;

CREATE POLICY "user reads own 2fa device" ON public.payment_2fa_devices
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_gc reads all 2fa devices" ON public.payment_2fa_devices
  FOR SELECT USING (public.is_admin_gc(auth.uid()));

-- Sem policy de INSERT/UPDATE/DELETE: só service_role escreve. Um usuário que
-- pudesse dar UPDATE aqui se auto-ativaria e pularia a prova de posse.

-- challenges — NENHUMA policy. RLS ligada + zero policy = ninguém em anon ou
-- authenticated lê ou escreve, nem por engano de um `select('*')` do client.
-- O REVOKE abaixo é cinto e suspensório: se um dia alguém criar uma policy sem
-- pensar, ainda falta o privilégio de tabela.
REVOKE ALL ON TABLE public.payment_2fa_challenges FROM anon, authenticated;

-- events — leitura pra auditoria e pro próprio dono acompanhar.
DROP POLICY IF EXISTS "user reads own 2fa events"    ON public.payment_2fa_events;
DROP POLICY IF EXISTS "admin_gc reads all 2fa events" ON public.payment_2fa_events;

CREATE POLICY "user reads own 2fa events" ON public.payment_2fa_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_gc reads all 2fa events" ON public.payment_2fa_events
  FOR SELECT USING (public.is_admin_gc(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC de consumo — ATÔMICA por obrigação
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE UM ÚNICO UPDATE, E NÃO "SELECT, confere, depois UPDATE":
--   O caminho ingênuo (ler o desafio, comparar o hash na edge function, marcar
--   como consumido) tem uma janela entre a leitura e a escrita. Dois cliques
--   simultâneos no botão de pagar — ou dois requests forjados de propósito —
--   leem a MESMA linha ainda não consumida, os dois acham o código válido, e os
--   dois liberam a transferência. O dinheiro sai duas vezes com um código só.
--   Aqui a condição de corrida não existe: o `consumed_at IS NULL` está no
--   WHERE do próprio UPDATE, então o Postgres serializa as duas transações na
--   mesma linha e a segunda encontra consumed_at já preenchido — 0 linhas.
--   Quem recebe linha de volta é o único autorizado a agir.
--
-- Uma resposta vazia significa, indistintamente: código errado, expirado, já
-- consumido, tentativas esgotadas ou purpose trocado. Isso é de propósito — o
-- chamador devolve um erro genérico e não entrega oráculo ao atacante.
CREATE OR REPLACE FUNCTION public.payment_2fa_consume_challenge(
  p_id        uuid,
  p_code_hash text,
  p_purpose   text
)
RETURNS TABLE (
  challenge_id uuid,
  company_id   uuid,
  user_id      uuid,
  purpose      text,
  device_id    uuid,
  transfer_id  uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.payment_2fa_challenges c
     SET consumed_at = now()
   WHERE c.id = p_id
     AND c.purpose = p_purpose
     AND c.consumed_at IS NULL
     AND c.expires_at > now()
     AND c.attempts < c.max_attempts
     -- Comparação de hash hex: o timing aqui não vaza nada útil, porque o que
     -- se compara já é a saída do HMAC com pepper — adivinhar prefixo de hash
     -- não ajuda a adivinhar o código.
     AND c.code_hash = p_code_hash
  RETURNING c.id, c.company_id, c.user_id, c.purpose, c.device_id, c.transfer_id;

  -- RETURN QUERY seta FOUND conforme a query devolveu linha ou não.
  IF NOT FOUND THEN
    -- Errou: gasta uma tentativa. UPDATE separado de propósito — o de cima não
    -- pode ter efeito colateral, senão um código CERTO também incrementaria.
    -- Sem `consumed_at IS NULL` aqui, uma enxurrada de tentativas depois do
    -- consumo poluiria o contador de um desafio já resolvido.
    UPDATE public.payment_2fa_challenges c
       SET attempts  = c.attempts + 1,
           failed_at = now()
     WHERE c.id = p_id
       AND c.consumed_at IS NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.payment_2fa_consume_challenge(uuid, text, text) IS
  'Consome um desafio de 2FA em UM único UPDATE condicional. Zero linhas = inválido/expirado/já usado (sem distinguir). service_role only.';

-- service_role only: quem chama é edge function. Um `authenticated` com acesso
-- a esta função conseguiria queimar tentativas de qualquer desafio (DoS) e,
-- pior, testar hashes direto. Funções nascem com EXECUTE pra PUBLIC — o REVOKE
-- é obrigatório, não decorativo (ver 20260814100400).
REVOKE EXECUTE ON FUNCTION public.payment_2fa_consume_challenge(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_2fa_consume_challenge(uuid, text, text)
  TO service_role;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- Derruba o 2FA de pagamento inteiro. Só faz sentido antes de existir
-- dispositivo ativo em produção — depois disso, quem revoga vira o único
-- caminho de pagamento sem segundo fator.
--
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.payment_2fa_consume_challenge(uuid, text, text);
--
--   DROP POLICY IF EXISTS "admin_gc reads all 2fa events"  ON public.payment_2fa_events;
--   DROP POLICY IF EXISTS "user reads own 2fa events"      ON public.payment_2fa_events;
--   DROP POLICY IF EXISTS "admin_gc reads all 2fa devices" ON public.payment_2fa_devices;
--   DROP POLICY IF EXISTS "user reads own 2fa device"      ON public.payment_2fa_devices;
--
--   DROP TRIGGER IF EXISTS audit_payment_2fa_devices           ON public.payment_2fa_devices;
--   DROP TRIGGER IF EXISTS trg_payment_2fa_devices_updated_at  ON public.payment_2fa_devices;
--   DROP TRIGGER IF EXISTS trg_payment_2fa_challenges_updated_at ON public.payment_2fa_challenges;
--
--   -- challenges antes de devices: tem FK device_id. Os índices
--   -- (uq_payment_2fa_devices_active_per_user, uq_payment_2fa_devices_phone,
--   -- idx_*) caem junto com as tabelas — não precisam de DROP próprio.
--   DROP TABLE IF EXISTS public.payment_2fa_challenges;
--   DROP TABLE IF EXISTS public.payment_2fa_events;
--   DROP TABLE IF EXISTS public.payment_2fa_devices;
-- COMMIT;
--
-- ORDEM ENTRE MIGRATIONS: payment_2fa_challenges.transfer_id referencia
-- payroll_pix_transfers (20260818120200). Se for pra derrubar as duas, ESTE
-- rollback roda PRIMEIRO — o DROP TABLE de lá esbarra nesta FK.
--
-- As edge functions payment-2fa-enroll-start / payment-2fa-enroll-confirm
-- passam a responder erro de tabela inexistente — remova-as do Supabase
-- (`npx supabase functions delete <nome>`) no mesmo movimento.
