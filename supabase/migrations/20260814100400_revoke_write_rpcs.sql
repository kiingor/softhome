-- Least privilege nas funções SECURITY DEFINER que ESCREVEM no banco.
--
-- O Postgres concede EXECUTE a PUBLIC em toda função na criação, e `anon`
-- herda PUBLIC. Em nenhuma das 132 migrations existe um REVOKE. Resultado: as
-- funções abaixo, que são SECURITY DEFINER e gravam dados, estão publicadas
-- como RPC do PostgREST e podem ser chamadas direto por qualquer um que tenha a
-- anon key — que está no bundle do frontend, por design.
--
--   generate_vacation_periods(uuid, uuid, date)
--     → cria períodos aquisitivos de férias pra qualquer collaborator_id.
--   insert_default_position_documents(uuid, uuid)
--     → insere documentos obrigatórios em qualquer cargo/empresa.
--
-- Nenhuma das duas é chamada pelo frontend nem por edge function (grep em src/
-- e supabase/functions/ retorna zero). As únicas chamadas vêm dos triggers
-- auto_generate_vacation_periods() e add_default_docs_to_new_position(), que
-- são SECURITY DEFINER — rodam como o dono da função, não como o chamador, e
-- portanto continuam funcionando depois do REVOKE.
--
-- Aproveita pra fechar o único SECURITY DEFINER sem search_path fixo do repo:
-- sem `SET search_path`, quem controla o search_path da sessão pode plantar uma
-- função homônima num schema à frente e fazê-la rodar com os privilégios do
-- dono.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.generate_vacation_periods(uuid, uuid, date)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.insert_default_position_documents(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.seed_admission_tests_for_company() SET search_path = public;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
--
-- GRANT EXECUTE ON FUNCTION public.generate_vacation_periods(uuid, uuid, date)
--   TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.insert_default_position_documents(uuid, uuid)
--   TO PUBLIC;
-- ALTER FUNCTION public.seed_admission_tests_for_company() RESET search_path;
--
-- COMMIT;
