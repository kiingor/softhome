# RLS Tests — SoftHome

Suite de testes de **Row Level Security** que valida o isolamento por CNPJ
(multi-CNPJ) e por papel exigidos pelo `docs/adr/0002-multi-cnpj.md`.

> ADR 0002: "Bug em policy = vazamento de dados entre filiais. Mitigação:
> testes de RLS automatizados (uma fixture por role + company, valida o que
> cada um vê)."

---

## Por que esses testes existem

A Softcom é um grupo com vários CNPJs (matriz + filiais). Toda tabela tem
`company_id`, e RLS no Postgres é a única coisa que impede que um G&C de
filial enxergue dado de outra filial. **Bug em policy = vazamento entre
filiais = pesadelo LGPD.**

Estes testes simulam usuários reais autenticados via Supabase Auth e
verificam, em cada tabela sensível, que:

- `admin` (futuro `admin_gc`) consegue ler tudo do grupo.
- `rh` / `gestor` / `colaborador` da empresa A **não** veem dados da empresa B.
- `colaborador` só vê seus próprios registros pessoais (badges, milestones).
- INSERT/UPDATE/DELETE respeitam o mesmo isolamento.

---

## AVISO IMPORTANTE

Os testes rodam contra um **banco Supabase real e linkado** (o projeto
configurado em `VITE_SUPABASE_URL`). Eles **CRIAM** usuários no `auth.users`,
**INSEREM** linhas em `companies`, `profiles`, `user_roles`, `collaborators`,
`badges`, `collaborator_badges`, `journey_milestones`, e fazem cleanup
(idempotente) ao final.

**Nunca rode em produção.** O recomendado é usar o projeto Supabase de
staging ou um Supabase local (`npx supabase start`).

Se o `cleanupFixtures` falhar no meio (ex: cancelamento manual), pode
ser preciso limpar manualmente os usuários criados (prefixo `rls-test-`).

---

## Como rodar

### Variáveis de ambiente necessárias

```bash
export VITE_SUPABASE_URL="https://<projeto>.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOi..."   # anon key
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."       # service_role (BYPASS RLS)
```

> A `SUPABASE_SERVICE_ROLE_KEY` **bypassa RLS** e é usada apenas pelas
> fixtures pra criar usuários e dados de teste. Nunca commite essa key.
> Pegue dela em **Project Settings → API → service_role secret** no Supabase.

### Comando

```bash
npm run test:rls
# ou
npx vitest run __tests__/rls --reporter=verbose
```

Sem as env vars, **os testes pulam** (skip) com aviso. Não falham — assim
não atrapalham `npm test` em máquina de dev sem credenciais.

---

## Modelo de fixtures

Para cada execução, `createFixtures()` cria:

| Fixture           | role         | company  | Notas                                                     |
|-------------------|--------------|----------|-----------------------------------------------------------|
| `companyA`        | —            | A        | CNPJ "Softcom Matriz" (fictício)                          |
| `companyB`        | —            | B        | CNPJ "Softcom Filial" (fictício)                          |
| `admin`           | `admin`      | —        | Sem company filter (vê tudo). Será `admin_gc` no futuro.  |
| `rhA`             | `rh`         | A        | G&C da empresa A. Será `admin_gc`/`gestor_gc` no futuro.  |
| `gestorA`         | `gestor`     | A        | Gestor de área da empresa A.                              |
| `colaboradorA`    | `colaborador`| A        | Linkado ao `collaboratorA` via `collaborators.user_id`.   |
| `collaboratorA`   | (registro)   | A        | Linha em `collaborators`.                                 |
| `collaboratorB`   | (registro)   | B        | Linha em `collaborators` (sem usuário associado).         |

Cada usuário é criado com email `rls-test-<role>-<companyTag>-<runId>@softhome.test`,
senha aleatória, e `email_confirm: true` (via service_role).

`signInAs(role, company)` retorna um cliente Supabase autenticado como
aquele usuário (usando a anon key, sujeito a RLS).

`cleanupFixtures(fixtures)` apaga, em ordem reversa de FK:
`collaborator_badges` → `journey_milestones` → `badges` → `collaborators`
→ `user_roles` → `profiles` → `auth.users` → `companies`.

---

## Como adicionar teste de uma tabela nova

Cada fase nova (Admissão, Recrutamento, Folha) deve ganhar seu arquivo
em `__tests__/rls/`. Padrão:

```ts
// __tests__/rls/<modulo>.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createFixtures, cleanupFixtures, signInAs,
  hasEnv, type Fixtures,
} from './fixtures';

const SKIP = !hasEnv();

describe.skipIf(SKIP)('<tabela> RLS', () => {
  let fx: Fixtures;
  beforeAll(async () => { fx = await createFixtures(); });
  afterAll(async () => { if (fx) await cleanupFixtures(fx); });

  it('admin vê linhas das duas empresas', async () => {
    const c = await signInAs(fx, 'admin');
    const { data } = await c.from('<tabela>').select('id, company_id');
    const cids = new Set((data ?? []).map(r => r.company_id));
    expect(cids.has(fx.companyA.id)).toBe(true);
    expect(cids.has(fx.companyB.id)).toBe(true);
  });

  it('rh da empresa A NÃO vê linhas da empresa B', async () => {
    const c = await signInAs(fx, 'rhA');
    const { data } = await c.from('<tabela>')
      .select('id').eq('company_id', fx.companyB.id);
    expect(data ?? []).toHaveLength(0);
  });

  // ...
});
```

### Checklist obrigatório para cada tabela com `company_id`

- [ ] `admin` lê linhas de A **e** de B
- [ ] usuário da empresa A **não** lê de B
- [ ] usuário da empresa A não consegue **inserir** linha com `company_id = B`
- [ ] usuário da empresa A não consegue **atualizar/deletar** linha de B
- [ ] se a tabela tiver dado pessoal (PII): `colaborador` lê **apenas o
  próprio** registro (não outros colaboradores da mesma empresa)

---

## Limitações conhecidas

- Precisa de `service_role` key (não roda em máquina de dev sem setup).
- Roda contra DB remoto: lento (~10s+) por causa de criar/destruir auth
  users via API. Para CI dedicado, considerar Supabase local (`supabase start`).
- Não cobre policies de **Storage** ainda (anexos de evidência, documentos
  de admissão). Adicionar quando bucket `private` for criado.
