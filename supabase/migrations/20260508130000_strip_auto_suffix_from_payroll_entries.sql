-- Migration: 20260508130000_strip_auto_suffix_from_payroll_entries.sql
-- Description: limpa o sufixo " (auto)" que era adicionado automaticamente nas
-- descrições de lançamentos auto-populados (salário base e benefícios).
-- O auto-populate foi atualizado pra não adicionar mais esse sufixo; aqui
-- normalizamos as entries antigas pra ficar consistente na UI.

BEGIN;

UPDATE public.payroll_entries
   SET description = regexp_replace(description, '\s*\(auto\)$', '')
 WHERE description ~ '\(auto\)$';

COMMIT;

-- ROLLBACK
-- Operação destrutiva (não há como saber quais descriptions tinham "(auto)"
-- depois do UPDATE). Se precisar reverter, restaurar do backup point-in-time.
