# Morning Brief — branch `feat/fundacao-completa`

**Sessão:** noite de 2026-04-27 → madrugada 2026-04-28
**Branch:** `feat/fundacao-completa` (baseada em `chore/remove-saas-layer`)
**Push:** ❌ não foi feito — branch só local
**Aplicar no banco:** ❌ nenhuma migration foi aplicada — só drafts

> **Lê isto inteiro antes de qualquer comando.** Tem ações irreversíveis sugeridas e uma ordem que importa.

---

## TL;DR

6 commits encadeados na branch local. Build verde a cada commit. Sem push, sem db push, sem nada remoto. Você revisa, aplica na ordem que decidir.

```
feat/fundacao-completa
├── ed09d52 feat(structure): scaffold src/modules layout
├── c803e2a feat(db): Fase 0 finalization migrations (drafts)
├── c5c09fa feat(db): Fase 1 schema — Jornada de Conhecimento (drafts)
├── 5660535 feat(journey): Fase 1 — Jornada de Conhecimento (UI + data layer)
├── d1815fb feat(skill): softhome-microcopy
└── 3121493 feat(db): Fases 2-5 schema drafts
```

---

## O que está pronto

### ✅ Estrutura de pastas (`src/modules/`)

`src/modules/{journey,admission,recruitment,payroll,core}/` criados com README de escopo cada. **Não foi feito refactor mass-move** — código herdado do meurh continua em `src/pages/dashboard/*`. Migra per-PR quando cada feature for tocada.

### ✅ Fase 0 finalização — schema (drafts, não aplicados)

3 migrations em `supabase/migrations/`:

| Arquivo | O que faz |
|---|---|
| `20260427130000_add_collaborator_regime.sql` | Enum `collaborator_regime` (clt/pj/estagiario), colunas `regime` + `termination_date` em `collaborators` |
| `20260427130100_add_company_multi_cnpj.sql` | `is_matriz` + `parent_company_id` em `companies` (per ADR 0002) |
| `20260427130200_create_audit_log.sql` | Tabela `audit_log` + função trigger reutilizável `audit_log_trigger()` (LGPD) |

### ✅ Fase 1 — Jornada de Conhecimento (completa)

**Schema** (3 migrations drafts):
- `20260427140000_create_journey_badges.sql` — catálogo de insígnias por empresa
- `20260427140100_create_collaborator_badges.sql` — atribuições com audit trigger
- `20260427140200_create_journey_milestones.sql` — marcos 30/60/90/180/anual

**Código** (módulo `src/modules/journey/`, completo):
- `types.ts` — Badge, CollaboratorBadge, JourneyMilestone + enums com labels pt-BR
- `schemas/badge.schema.ts` — zod
- `hooks/use-badges.ts` — CRUD com TanStack Query
- `hooks/use-collaborator-badges.ts` — atribuir/listar
- `hooks/use-journey-milestones.ts` — listar/avaliar
- `components/BadgeCard.tsx`, `BadgeForm.tsx`, `BadgeAssignmentForm.tsx`
- `pages/BadgesPage.tsx` — catálogo (rota `/dashboard/jornada/badges`)
- `pages/JornadaPage.tsx` — visão de time (rota `/dashboard/jornada`)

**Integração:**
- Rotas adicionadas em `src/App.tsx`
- Item "Jornada" (Trophy icon) no `DashboardSidebar`, categoria Gestão
- `ModuleType` em `usePermissions.ts` ganhou `'jornada'`

### ✅ Skill `softhome-microcopy`

`.claude/skills/softhome-microcopy/SKILL.md` — codifica a tabela do `DESIGN_SYSTEM.md` seção 4. Triggers em pedidos de microcopy pra que futuro código siga o tom (amigável, direto, emoji só em conquista).

### ✅ Fases 2-5 — schema drafts (sem UI)

4 migrations drafts. **Sem implementação de UI** porque exige você pra validar fluxo, microcopy, regras de negócio.

| Arquivo | Tabelas/Views |
|---|---|
| `20260427150000_create_admission_schema.sql` | `admission_journeys` + `admission_documents` + `admission_events` + 3 enums (state machine completa) |
| `20260427150100_create_recruitment_schema.sql` | `candidates` + `job_openings` + `candidate_applications` + `interview_schedules` + `interview_feedbacks` + 2 enums |
| `20260427150200_create_payroll_schema.sql` | `payroll_periods` + `payroll_alerts` + 3 enums (`payroll_entries` já existe) |
| `20260427150300_create_agent_views.sql` | 3 views read-only `agent_*` sem PII |

---

## O que NÃO foi feito (deliberado)

| Item | Por que não |
|---|---|
| Push da branch pro origin | Você pediu pra não pushar |
| Aplicar migrations no banco (`db push`) | Você pediu pra revisar primeiro |
| Refactor mass-move dos arquivos meurh pra `modules/` | Toca dezenas de arquivos sem revisão semântica → bagunça |
| Role rename (`admin → admin_gc`, novo `gestor_gc`) | Mudança acoplada DB + 6 arquivos TS — merece PR própria com tudo síncrono |
| UI de Admissão/Recrutamento/Folha/Agentes | Decisões de fluxo (o quê coletar, em que ordem, qual microcopy de erro) precisam de você. Implementar sem essas decisões = código que vai pro lixo |
| Criar primeiro user admin | Precisa do service_role key. Você faz no Supabase Dashboard → Authentication |
| Edge Functions (admission-document-validate, recruitment-cv-screen, journey-snapshot, payroll-export) | São outra fase do trabalho — precisam Claude API key + decisões de prompt |
| Ilustrações unDraw em emerald em `src/shared/illustrations/` | Diretório existe vazio. Empty states já funcionam com ícones lucide; ilustrações entram com calma |
| Migração lucide → Phosphor | 59 arquivos — fora do escopo desta noite |
| Testes RLS automatizados (ADR 0002 menciona) | Não há suite de testes RLS estruturada ainda |

---

## Ordem sugerida pra você de manhã

### 1. Mergear PR1 primeiro

```bash
# Vai pro PR aberto (chore/remove-saas-layer) e mergeia em main
# (via UI do GitHub).
```

Por quê: `feat/fundacao-completa` foi criada em cima dessa branch. Se você mergear primeiro, o rebase de `feat/fundacao-completa` em `main` é trivial (fast-forward).

### 2. Rebase desta branch em `main` (após o merge)

```bash
git checkout main
git pull
git checkout feat/fundacao-completa
git rebase main
# resolver conflitos se houver — não deve ter, são changesets disjuntos
```

### 3. Revisar os 6 commits

```bash
git log --oneline main..HEAD
git show <hash>     # pra cada commit
```

Mais importante: **olha cada migration `.sql`** linha por linha antes de aplicar. Especialmente:
- RLS policies — confere que admin_gc/gestor_gc/rh estão corretos pra sua intenção
- Constraints check (ex: `companies_matriz_no_parent`) — confere que não te trava em casos legítimos
- Cascade behaviors — `ON DELETE RESTRICT` vs `CASCADE` vs `SET NULL`

### 4. Aplicar migrations no cloud (sa-east-1)

```bash
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
npx supabase db push
```

Vai aplicar **na ordem cronológica** das 10 migrations novas:

```
20260427130000_add_collaborator_regime
20260427130100_add_company_multi_cnpj
20260427130200_create_audit_log
20260427140000_create_journey_badges
20260427140100_create_collaborator_badges
20260427140200_create_journey_milestones
20260427150000_create_admission_schema
20260427150100_create_recruitment_schema
20260427150200_create_payroll_schema
20260427150300_create_agent_views
```

⚠️ **Decisão sua:** quer aplicar tudo de uma vez, ou só Fase 0+1 e deixar Fase 2-5 pra quando for implementar?

Recomendo **só Fase 0+1 agora** (até `20260427140200`), porque:
- Aplicar Fase 2-5 sem UI cria tabelas que ninguém usa por meses → schema drift se você decidir mudar
- Se fizer só Fase 0+1, dá pra exercitar a Jornada hoje mesmo e validar o design real
- Pra fazer só Fase 0+1: mover temporariamente os arquivos `20260427150*.sql` pra outra pasta antes do `db push`, depois colocar de volta

Pra aplicar só Fase 0+1:
```bash
mkdir -p _pending
mv supabase/migrations/20260427150*.sql _pending/
npx supabase db push
mv _pending/*.sql supabase/migrations/
rmdir _pending
```

### 5. Regenerar types

```bash
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

Após isso, você pode (opcionalmente) fazer cleanup: remover `as any` casts nos hooks de `src/modules/journey/hooks/*.ts`. Procure por:
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
```
e substitua os `sb.from(...)` por `supabase.from(...)` (já com types reais).

### 6. Criar primeiro user admin (no Supabase Dashboard)

1. Authentication → Add user → email/senha
2. SQL Editor:
```sql
-- pegue o user_id criado e o company_id (você vai criar uma company primeiro)
INSERT INTO profiles (user_id, full_name, company_id) VALUES (...);
INSERT INTO user_roles (user_id, role, company_id) VALUES (..., 'admin', ...);
-- ainda usa 'admin' (legacy) porque o role rename é PR separada futura
```

### 7. `npm run dev` e testar Jornada

- Login com user criado
- Navega pra Dashboard → Gestão → **Jornada**
- Cria uma insígnia ("Primeira Tech Talk")
- Atribui pra um colaborador qualquer (vai precisar ter colaborador cadastrado primeiro em Colaboradores)
- Confere stats no dashboard da jornada

Se algo quebrar:
- Erro de tabela não existe → migration não aplicou; volta pro passo 4
- Erro RLS → user não tem role correto; ajusta no SQL Editor
- Erro de tipo TS → types não regeneraram; volta pro passo 5

---

## Pendências flagged pra próximas PRs

### PR de role rename (priority: alta)

**Mudança acoplada DB + código:**

DB: recriar enum `app_role` substituindo `admin/rh` por `admin_gc/gestor_gc`. Pattern com `CREATE TYPE app_role_new` + `ALTER COLUMN ... USING CASE` + `DROP TYPE` + `RENAME` (ver final desta seção).

Código: atualizar 6 arquivos:
- `src/contexts/DashboardContext.tsx` — `AppRole` type literal
- `src/contexts/PortalContext.tsx`
- `src/components/dashboard/RoleGuard.tsx`
- `src/components/collaborators/CollaboratorModal.tsx`
- `src/pages/dashboard/RelatoriosPage.tsx`
- `src/pages/dashboard/FeriasPage.tsx`

E remover o "fallback de role legacy" em todas as RLS policies (`role::text IN ('admin_gc', 'admin')` vira só `'admin_gc'`).

Migration sketch:
```sql
BEGIN;
CREATE TYPE app_role_new AS ENUM ('admin_gc', 'gestor_gc', 'gestor', 'colaborador', 'contador');
ALTER TABLE user_roles
  ALTER COLUMN role TYPE app_role_new
  USING (
    CASE role::text
      WHEN 'admin' THEN 'admin_gc'::app_role_new
      WHEN 'rh' THEN 'admin_gc'::app_role_new
      ELSE role::text::app_role_new
    END
  );
DROP TYPE app_role;
ALTER TYPE app_role_new RENAME TO app_role;
COMMIT;
```

⚠️ Antes de aplicar, validar que `has_role()` e outras funções não vão dar erro com a recriação do tipo (signatures podem precisar ser dropadas e recriadas).

### `.env` é tracked (priority: média)

`git status` mostra `.env` como modificado, ou seja, está sendo trackeado. CLAUDE.md diz que NUNCA deve ser commitado. Adicionar ao `.gitignore`:

```bash
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "chore: untrack .env (per CLAUDE.md security)"
```

Cuidado: o `.env` atual ainda fica no histórico. Se já tem credenciais sensíveis no histórico, considera **rotacionar a publishable key** depois (Supabase Dashboard).

### Collaborator profile + journey tab (priority: média)

A página `JornadaPage.tsx` mostra o time inteiro mas não tem drill-down pra um colaborador específico. Quando a feature de "perfil do colaborador" for trabalhada, adicionar tab "Jornada" mostrando todas badges + milestones daquela pessoa.

### Edge Functions de Fases 2-5 (priority: baixa por enquanto)

Pra cada fase quando começar:
- Fase 2: `admission-document-validate` (Claude analisa doc), `admission-guide-generator` (PDF), `admission-send-to-contabil` (zip + email)
- Fase 3: `recruitment-cv-screen` (Claude analisa CV vs vaga), `recruitment-interview-summary`
- Fase 1 (já tem schema, falta a função): `journey-snapshot` (cron diário gera milestones)
- Fase 4: `payroll-export` (Excel pro contador)

Cada uma é seu próprio PR com Claude API integration. Skill `claude-api` ajuda.

---

## Decisões que você precisa tomar (não fiz por você)

1. **WhatsApp Evolution API**: v1 ou backlog? CLAUDE.md tem isso como "a confirmar".
2. **Email transacional**: Resend ou AWS SES?
3. **Política de retenção LGPD por tabela**: ainda não decidida. Importante pra audit_log especialmente.
4. **Lista de CNPJs do grupo Softcom**: precisa ser cadastrada na primeira vez.
5. **Domínio interno**: `gc.softcom.com.br` ou outro?

---

## Build status final

`npm run build` ✓ verde. Bundle: 2.29 MB JS / 79 KB CSS / 0.89 KB HTML. Mesmos 2 warnings pré-existentes (Browserslist desatualizado, chunk > 500 kB) — nenhum introduzido pela sessão.

---

## Se você decidir descartar tudo

Branch é local, sem push. Pra apagar inteiro:

```bash
git checkout main
git branch -D feat/fundacao-completa
```

Migrations ficam no histórico do git mas como nada foi aplicado, banco continua intacto. Total reversibilidade.
