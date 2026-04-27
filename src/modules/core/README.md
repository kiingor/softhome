# `core/` — Base compartilhada

Tabelas e features que todos os módulos usam: companies, collaborators, auth, audit log.

## Escopo

- Hierarquia organizacional: companies → stores → teams → collaborators
- Auth + roles (admin_gc, gestor_gc, contador, colaborador)
- Audit log centralizado
- Multi-CNPJ (matriz + filiais)

## Tabelas-chave

- `companies` — CNPJs do grupo Softcom
  - `is_matriz` — indica matriz
  - `parent_company_id` — FK pra matriz (filiais apontam pra cá)
- `stores` — filiais físicas dentro do mesmo CNPJ
- `teams` — áreas/departamentos
- `positions` — cargos
- `collaborators` — pessoas
  - `regime` — enum CLT/PJ/Estagiário
  - `admission_date`, `termination_date`
- `collaborator_documents` — docs com PII (audit obrigatório)
- `audit_log` — log centralizado de operações em PII (LGPD)
- `profiles` — Supabase auth → profile bridge
- `user_roles` — quem tem qual role

## Roles (v1)

Renomeados de `admin/rh/gestor/contador/colaborador` herdados do meurh:

- `admin_gc` — administra G&C, vê tudo da empresa
- `gestor_gc` — gestor de área, vê só seu time
- `contador` — read-only de folha pra exportação
- `colaborador` — Portal pessoal apenas

`rh` (legacy meurh) → vira `admin_gc`. `admin` (legacy) → vira `admin_gc`.

## Audit log

Tabela `audit_log` com triggers em toda tabela com PII. Campos: `id, user_id, action (insert/update/delete), table_name, record_id, before, after, created_at`.

LGPD obrigatório. Retenção definida por tabela em ADR futuro.
