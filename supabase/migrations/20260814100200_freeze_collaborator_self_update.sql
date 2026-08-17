-- Impede que o colaborador reescreva o próprio cadastro pelo portal.
--
-- Duas policies permitem hoje UPDATE na própria linha de `collaborators`:
--   - "Users can link themselves to collaborator" (20260121024029:6)
--       USING/WITH CHECK apenas lower(email) = lower(auth.jwt() ->> 'email')
--   - "Users with permission can update collaborators" (20260122024624:30)
--       ... OR (user_id = auth.uid() AND lower(email) = lower(jwt.email))
--
-- Nenhuma das duas limita QUAIS COLUNAS podem mudar. O objetivo era só permitir
-- o auto-vínculo (preencher user_id), mas na prática o colaborador logado
-- consegue um PATCH em `current_salary` (base de toda a folha — ver
-- use-payroll.ts) e em `pix_key` (destino do pagamento), além de cpf, cargo e
-- data de admissão.
--
-- RLS decide sobre a LINHA, não sobre a COLUNA. Por isso a trava vai num
-- trigger BEFORE UPDATE, que cobre as duas policies de uma vez e continua
-- valendo se uma terceira aparecer amanhã.
--
-- Hoje o impacto é latente (nenhum colaborador tem user_id vinculado). Vira
-- exploração real no dia em que o portal for ligado de verdade — que é o
-- roadmap.

BEGIN;

CREATE OR REPLACE FUNCTION public.collaborators_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role, migrations e edge functions não têm auth.uid(): passam.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Quem é RH/admin edita normalmente.
  IF public.is_admin_gc(auth.uid())
     OR public.has_module_permission(auth.uid(), NEW.company_id, 'colaboradores', 'can_edit')
  THEN
    RETURN NEW;
  END IF;

  -- Auto-serviço: a ÚNICA coluna que o próprio colaborador pode gravar é o
  -- user_id, e só uma vez, num cadastro ainda solto. Todo o resto volta ao
  -- valor anterior em silêncio.
  IF OLD.user_id IS NULL AND NEW.user_id = auth.uid() THEN
    NEW := OLD;
    NEW.user_id := auth.uid();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Alteração não permitida neste cadastro'
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_collaborators_self_update_guard ON public.collaborators;
CREATE TRIGGER trg_collaborators_self_update_guard
  BEFORE UPDATE ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.collaborators_self_update_guard();

-- Redundante depois do trigger e mais frouxa que a irmã (casa por e-mail sem
-- exigir user_id): um usuário cujo e-mail bata com o de outro colaborador
-- alcançava a linha dele.
DROP POLICY IF EXISTS "Users can link themselves to collaborator" ON public.collaborators;

COMMIT;

-- ─── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
--
-- DROP TRIGGER IF EXISTS trg_collaborators_self_update_guard ON public.collaborators;
-- DROP FUNCTION IF EXISTS public.collaborators_self_update_guard();
--
-- CREATE POLICY "Users can link themselves to collaborator"
-- ON public.collaborators
-- FOR UPDATE
-- TO authenticated
-- USING (lower(email) = lower(auth.jwt() ->> 'email'))
-- WITH CHECK (lower(email) = lower(auth.jwt() ->> 'email'));
--
-- COMMIT;
