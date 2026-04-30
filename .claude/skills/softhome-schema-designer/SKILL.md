---
name: SoftHouse-schema-designer
description: Use this skill when designing or modifying database schema for the SoftHouse system. Triggers on requests to create tables, write migrations, define RLS policies, add indexes, or model new entities. Applies SoftHouse conventions automatically (uuid PKs, timestamps, audit triggers, RLS by company_id, rollback blocks). Do not use for queries, edge functions, or frontend modeling.
---

# SoftHouse Schema Designer

Skill para modelagem e migrations no SoftHouse. Aplica convenções do projeto sem precisar perguntar.

## Quando usar

- Criar nova tabela
- Adicionar coluna em tabela existente
- Escrever policy RLS
- Criar índice
- Definir trigger ou function
- Modelar relação entre entidades

## Não usar para

- SELECT/INSERT/UPDATE em queries de aplicação
- Edge Functions
- Componentes React
- Lógica de cálculo

## Convenções obrigatórias SoftHouse

### Toda tabela nova tem
1. `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
2. `company_id uuid NOT NULL REFERENCES companies(id)` — exceto tabelas globais (badges catalog, etc)
3. `created_at timestamptz NOT NULL DEFAULT now()`
4. `updated_at timestamptz NOT NULL DEFAULT now()`
5. RLS habilitado: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
6. Policies: pelo menos `admin_gc`, `gestor_gc`, owner se aplicável
7. Trigger `updated_at` automático
8. Audit trigger se a tabela tem PII

### Nomenclatura
- Tabelas: inglês, plural, snake_case (`collaborators`, `job_openings`)
- Colunas: inglês, snake_case (`admission_date`, `is_active`)
- FKs: `<entidade_singular>_id` (`collaborator_id`, `company_id`)
- Booleanos: `is_*`, `has_*`, `can_*`
- Timestamps: `*_at` (`created_at`, `approved_at`, `closed_at`)
- Enums: nome plural snake_case (`collaborator_status`, `payroll_entry_type`)

### Migrations
- Nome do arquivo: `YYYYMMDDHHMMSS_descricao_curta.sql`
- Sempre incluir bloco de rollback comentado no fim
- Uma mudança lógica por migration (não misturar criação de tabela com alteração de outra)

## Templates

### Template 1 — Nova tabela com PII (precisa audit)

```sql
-- Migration: YYYYMMDDHHMMSS_create_<table>.sql
-- Description: cria tabela <descrição>

BEGIN;

-- 1. Criar tabela
CREATE TABLE public.<table_name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- campos específicos aqui
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Índices
CREATE INDEX idx_<table>_company ON public.<table_name>(company_id);
-- outros índices conforme necessário

-- 3. Trigger updated_at
CREATE TRIGGER set_updated_at_<table>
  BEFORE UPDATE ON public.<table_name>
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Audit trigger (apenas se contém PII)
CREATE TRIGGER audit_<table>
  AFTER INSERT OR UPDATE OR DELETE ON public.<table_name>
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();

-- 5. RLS
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

-- admin_gc lê tudo
CREATE POLICY "admin_gc_select_all_<table>"
  ON public.<table_name> FOR SELECT
  USING (public.has_role(auth.uid(), 'admin_gc'));

-- gestor_gc lê sua empresa
CREATE POLICY "gestor_gc_select_own_company_<table>"
  ON public.<table_name> FOR SELECT
  USING (
    public.has_role(auth.uid(), 'gestor_gc')
    AND public.belongs_to_company(auth.uid(), company_id)
  );

-- admin_gc insere
CREATE POLICY "admin_gc_insert_<table>"
  ON public.<table_name> FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin_gc'));

-- gestor_gc insere na própria empresa
CREATE POLICY "gestor_gc_insert_own_company_<table>"
  ON public.<table_name> FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_gc')
    AND public.belongs_to_company(auth.uid(), company_id)
  );

-- regras de update/delete análogas (geralmente só admin_gc)

COMMIT;

-- ROLLBACK
-- BEGIN;
-- DROP TABLE IF EXISTS public.<table_name> CASCADE;
-- COMMIT;
```

### Template 2 — Adicionar coluna

```sql
-- Migration: YYYYMMDDHHMMSS_add_<col>_to_<table>.sql

BEGIN;

ALTER TABLE public.<table_name>
  ADD COLUMN <col_name> <type> [NOT NULL DEFAULT <default>];

-- Se NOT NULL sem default em tabela com dados, fazer em 3 passos:
-- 1) ADD COLUMN nullable
-- 2) UPDATE preenchendo
-- 3) ALTER COLUMN SET NOT NULL

-- Se for FK:
-- ADD CONSTRAINT fk_<table>_<col>
--   FOREIGN KEY (<col_name>) REFERENCES public.<other>(id) ON DELETE <action>;

-- Se precisar de índice:
-- CREATE INDEX idx_<table>_<col> ON public.<table_name>(<col_name>);

COMMIT;

-- ROLLBACK
-- BEGIN;
-- ALTER TABLE public.<table_name> DROP COLUMN <col_name>;
-- COMMIT;
```

### Template 3 — Enum novo

```sql
BEGIN;

CREATE TYPE public.<enum_name> AS ENUM (
  'value1',
  'value2',
  'value3'
);

-- usar em coluna:
-- ALTER TABLE x ADD COLUMN status public.<enum_name> NOT NULL DEFAULT 'value1';

COMMIT;

-- ROLLBACK (atenção: precisa remover usos antes)
-- DROP TYPE IF EXISTS public.<enum_name>;
```

### Template 4 — View para agentes

Views `agent_*` são read-only, agregadas, sem PII bruta.

```sql
BEGIN;

CREATE VIEW public.agent_<descricao> AS
SELECT
  company_id,
  -- campos agregados, NUNCA cpf, rg, salario individual nominal, endereço completo
  COUNT(*) as total,
  -- outras agregações
FROM public.<source>
WHERE -- filtros
GROUP BY company_id;

-- RLS na view
ALTER VIEW public.agent_<descricao> SET (security_invoker = true);
-- view herda RLS das tabelas-fonte; com security_invoker ela respeita RLS do usuário consultando

COMMIT;
```

### Template 5 — Function helper

```sql
CREATE OR REPLACE FUNCTION public.<function_name>(<args>)
RETURNS <return_type>
LANGUAGE sql
STABLE                       -- ou IMMUTABLE / VOLATILE conforme caso
SECURITY DEFINER             -- só se precisar bypass de RLS — justificar
SET search_path = public
AS $$
  -- corpo
$$;
```

`SECURITY DEFINER` requer:
- Comentário explicando por quê
- `SET search_path = public` pra evitar injeção
- Validação interna de permissão (não confia que chamador é autorizado)

## Funções de RLS já existentes (não recriar)

Usar essas funções helper que já estão no banco:
- `public.has_role(_user_id uuid, _role app_role) → boolean`
- `public.belongs_to_company(_user_id uuid, _company_id uuid) → boolean`
- `public.is_admin_gc(_user_id uuid) → boolean` (atalho pra `has_role(uid, 'admin_gc')`)
- `public.handle_updated_at()` — trigger function pra `updated_at`
- `public.audit_log_trigger()` — trigger function pra audit log

Se alguma não existe ainda, criar na migration apropriada e listar aqui.

## Checklist antes de dar OK em uma migration

- [ ] Nome do arquivo segue padrão `YYYYMMDDHHMMSS_descricao.sql`
- [ ] BEGIN/COMMIT envolvendo
- [ ] Bloco de ROLLBACK comentado
- [ ] RLS habilitado se tabela nova
- [ ] Policies pra todos os roles relevantes
- [ ] Audit trigger se tem PII
- [ ] Trigger `updated_at` se tabela tem coluna
- [ ] Índices nos campos consultados (FKs, filtros frequentes)
- [ ] FK com `ON DELETE` definido (RESTRICT, CASCADE, SET NULL — conforme caso)
- [ ] Sem dados de exemplo/seed misturados (seed em arquivo separado)
- [ ] `npx supabase gen types` rodado depois de aplicar

## O que NÃO fazer

- Tabela sem RLS
- Tabela com PII sem audit trigger
- `SECURITY DEFINER` sem `SET search_path`
- Migration sem ROLLBACK
- Misturar criação de várias tabelas não relacionadas em uma migration
- Nomes em português (português só em UI/microcopy)
- View `agent_*` que retorna CPF, RG, endereço completo, ou salário individual nominal

## Quando o usuário pedir uma tabela, sempre perguntar (se não estiver claro)

1. Tem PII? (define se precisa audit trigger)
2. Quem precisa ler? (define policies)
3. Quem precisa escrever? (define policies)
4. Tem FK pra qual tabela?
5. Index em qual coluna pra performance?
6. Comportamento `ON DELETE` da FK (cascata, restrição, set null)?

Se ficar claro do contexto, não pergunta — aplica os defaults SoftHouse.
