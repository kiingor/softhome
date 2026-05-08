-- Migration: 20260508140000_promote_initial_admins.sql
-- Description: data fix one-shot. Promove 3 usuários internos do RH/G&C de
-- 'colaborador' pra 'admin_gc' em user_roles. Foi um bug de fluxo: a
-- create-collaborator-user edge function hardcoda role='colaborador' e a UI
-- de Usuários só permitia editar permissões granulares, não o role.
--
-- Idempotente: o WHERE filtra apenas quem ainda tem 'colaborador'.

BEGIN;

UPDATE public.user_roles
   SET role = 'admin_gc'
 WHERE role = 'colaborador'
   AND user_id IN (
     SELECT id
       FROM auth.users
      WHERE email IN (
        'administracao@softcomtecnologia.com.br',
        'gentecultura@softcomtecnologia.com.br',
        'performance@softcomtecnologia.com.br'
      )
   );

COMMIT;

-- ROLLBACK (não recomendado — vai voltar pra colaborador):
-- BEGIN;
-- UPDATE public.user_roles
--    SET role = 'colaborador'
--  WHERE role = 'admin_gc'
--    AND user_id IN (
--      SELECT id FROM auth.users WHERE email IN (
--        'administracao@softcomtecnologia.com.br',
--        'gentecultura@softcomtecnologia.com.br',
--        'performance@softcomtecnologia.com.br'
--      )
--    );
-- COMMIT;
