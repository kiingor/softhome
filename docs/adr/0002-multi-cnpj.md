# ADR 0002 — Multi-CNPJ e RLS

**Data:** 2026-04-27
**Status:** Aceito

## Contexto

Softcom é grupo econômico: matriz tem CNPJ A, filiais têm CNPJs B, C, D distintos. Cada colaborador é vinculado a um CNPJ específico (não é só "filial física"). Implicações:

- eSocial é **por CNPJ** — exportação de folha precisa separar
- Contador pode ser diferente por CNPJ
- Time de G&C da matriz vê tudo; G&C de filial pode ver só sua empresa
- LGPD: vazamento entre CNPJs é o pesadelo a evitar

## Decisão

### Manter `company_id` em todas as tabelas

Mesmo sendo "single-tenant Softcom", `company_id` continua referenciando o CNPJ específico. A "tenant" do sistema é a Softcom como grupo, mas a separação por CNPJ é **obrigatória de negócio**.

### Hierarquia

```
companies (CNPJs)
  ├─ id, cnpj, razao_social, is_matriz (boolean)
  ├─ parent_company_id (nullable — aponta pra matriz se for filial)
  └─ stores (filiais físicas dentro do mesmo CNPJ — opcional)
       └─ teams (departamentos)
            └─ collaborators
```

Tabela `companies` ganha:
- `cnpj` (text, unique, validado)
- `razao_social` (text)
- `is_matriz` (boolean)
- `parent_company_id` (uuid, nullable, FK self)

### RLS — política em camadas

#### Roles
```sql
CREATE TYPE app_role AS ENUM (
  'admin_gc',     -- G&C matriz, vê tudo do grupo
  'gestor_gc',    -- G&C de filial, vê só sua empresa
  'gestor',       -- gestor de área, vê só seu time
  'colaborador',  -- vê só seus próprios dados
  'contador'      -- read-only em tabelas de folha
);
```

Tabela `user_roles` (já existe no `meurh`, mantém):
```
user_roles
  user_id, company_id (nullable pra admin_gc), role
```

#### Policies padrão por tabela

```sql
-- exemplo: collaborators
CREATE POLICY "admin_gc lê tudo" ON collaborators
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid() AND role = 'admin_gc')
  );

CREATE POLICY "gestor_gc lê sua empresa" ON collaborators
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
              AND role = 'gestor_gc'
              AND company_id = collaborators.company_id)
  );

CREATE POLICY "colaborador lê só seu próprio" ON collaborators
  FOR SELECT USING (user_id = auth.uid());
```

Padrão repetido em toda tabela com `company_id`.

#### Funções helper (mantém do `meurh`, ajusta)

```sql
CREATE FUNCTION is_admin_gc(_user_id uuid) RETURNS boolean ...
CREATE FUNCTION belongs_to_company(_user_id uuid, _company_id uuid) RETURNS boolean ...
CREATE FUNCTION has_role(_user_id uuid, _role app_role) RETURNS boolean ...
```

Remove `is_master_admin` (era multi-tenant master, não faz sentido aqui).

## Alternativas consideradas

### Single-tenant simples (sem `company_id` nas tabelas)
**Rejeitada.** CNPJs distintos exigem separação contábil/fiscal/eSocial. Sem `company_id` virariam queries com `JOIN` por colaborador → empresa em todo lugar. Pior performance e RLS impossível.

### Schemas Postgres separados por CNPJ
**Rejeitada.** Operacionalmente complexo (migration por schema, queries cross-schema dolorosas). RLS resolve com menos overhead.

### Soft-delete com `tenant_id` + `company_id`
**Rejeitada.** `tenant_id` redundante quando só temos uma "tenant" (Softcom). `company_id` cumpre os dois papéis.

## Consequências

### Positivas
- Separação por CNPJ explícita no schema
- Aproveita RLS já desenhado no `meurh`
- Permite admin_gc da matriz ver consolidado do grupo
- Fácil exportação de folha por CNPJ (filtro direto)

### Negativas
- Toda query tem que filtrar por `company_id` (RLS faz automático, mas dev precisa ter ciência)
- Joins entre tabelas precisam manter coerência de `company_id` (validar com triggers se necessário)

### Riscos
- **Bug em policy = vazamento de dados entre filiais.** Mitigação: testes de RLS automatizados (uma fixture por role + company, valida o que cada um vê).
- **Performance se número de empresas crescer muito.** Não é o caso da Softcom (~5-15 CNPJs no máximo).

## Padrão de teste de RLS

Toda tabela nova precisa de teste:

```ts
// __tests__/rls/collaborators.test.ts
test('gestor_gc da empresa A não vê colaboradores da empresa B', async () => {
  const supabase = createClientAs('gestor_gc', 'company-A');
  const { data } = await supabase.from('collaborators')
    .select('*').eq('company_id', 'company-B');
  expect(data).toHaveLength(0);
});
```

## Revisão

Revisitar se Softcom adquirir empresa fora do grupo (vira multi-tenant de verdade) ou se reduzir pra um único CNPJ (simplifica).
