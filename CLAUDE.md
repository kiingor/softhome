# SoftHouse — Sistema de Gente & Cultura interno

> Contexto pro Claude Code. Lê isso antes de qualquer ação no repo.

## O que é

Sistema interno de RH da Softcom (~300 colaboradores). Single-tenant, multi-CNPJ (matriz + filiais como CNPJs distintos do mesmo grupo). Substitui processos manuais de admissão, recrutamento, controle de folha e acompanhamento de onboarding.

Forkado a partir do `kiingor/meurh` (produto SaaS comercial), em processo de transformação pra sistema interno. Ver `docs/PR1-LIMPEZA.md` pro estado da migração.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + shadcn/ui + Tailwind v4
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions Deno)
- **Hospedagem dados:** Supabase Cloud Pro, sa-east-1 (LGPD — dado em território nacional)
- **IA produção:** Claude (paga) v1 → modelo local em fase posterior
- **Tipografia:** Manrope (interface + títulos)
- **Ícones:** Phosphor Icons
- **Cor accent:** emerald (#F97316)
- **Forms:** react-hook-form + zod
- **Tabelas:** TanStack Table

## Quem trabalha aqui

Solo dev (eu, kiingor) cumulando dev + PO + PM. Bus factor = 1, então:
- Documentação viva é obrigatória (este arquivo, ADRs, plano)
- Decisões arquiteturais ficam em `docs/adr/`
- Skills de dev em `.claude/skills/` aceleram entrega

## Princípios não-negociáveis

1. **LGPD primeiro.** Audit log em toda tabela com PII. Dado pessoal mascarado em log/erro. Retenção definida por tabela.
2. **CLT é território minado.** Não calculamos folha. Folha v1 é controle de lançamentos + exportação pro contador. Cálculo CLT, eSocial, encargos = projeto de 9-15 meses, fora do escopo.
3. **Agente nunca escreve dado irreversível sem aprovação humana.** Mesmo interno. Mesmo "óbvio". Policy layer obrigatório.
4. **RLS em tudo.** Toda tabela tem policy por `company_id` + role. Sem exceção.
5. **Migration tem rollback.** Toda migration tem `up` e `down`. Sem exceção.

## Estrutura de pastas

```
src/
├── modules/              # 1 pasta por módulo do produto
│   ├── admission/        # components, hooks, services, types, routes
│   ├── recruitment/
│   ├── payroll/
│   ├── journey/          # jornada de conhecimento (insígnias)
│   └── core/             # collaborators, companies, auth
├── shared/
│   ├── ui/               # shadcn (não editar diretamente, usar CLI)
│   ├── components/       # genéricos: DataTable, FormField, EmptyState
│   ├── hooks/
│   ├── illustrations/    # SVGs (unDraw em emerald)
│   └── utils/
├── lib/
│   ├── supabase.ts
│   ├── claude.ts         # cliente Anthropic (agentes do produto)
│   └── mcp/              # cliente MCP local (acesso de agentes ao banco)
└── agents/               # agentes do produto (chat embarcado)
    ├── analyst/          # Agente Analista G&C
    └── recruiter/        # Agente Recruiter (triagem)

supabase/
├── migrations/           # SQL versionado, sempre com rollback
├── functions/            # Edge Functions (Deno)
│   ├── admission-document-validate/
│   ├── recruitment-cv-screen/
│   ├── payroll-export/
│   ├── journey-snapshot/
│   └── agent-mcp-bridge/
└── seed/

docs/
├── PLANEJAMENTO.md       # plano completo, fonte de verdade do escopo
├── DESIGN_SYSTEM.md      # tokens, microcopy, padrões visuais
├── PR1-LIMPEZA.md        # checklist da migração meurh → SoftHouse
└── adr/                  # Architecture Decision Records
    ├── 0001-stack.md
    ├── 0002-multi-cnpj.md
    ├── 0003-agents.md
    └── 0004-design-system.md

.claude/
└── skills/               # skills de dev (Claude Code carrega automaticamente)
    └── SoftHouse-schema-designer/
        └── SKILL.md
```

## Convenções

### Nomenclatura
- Tabelas e colunas: **inglês**, `snake_case`
- Arquivos TS/TSX: `kebab-case.ts` ou `PascalCase.tsx` (componentes)
- FKs: sempre `<entidade>_id` (ex: `collaborator_id`, `company_id`)
- Timestamps: sempre `created_at`, `updated_at`, `<acao>_at`
- Booleanos: `is_*`, `has_*`, `can_*`

### Migrations
- Nome: `YYYYMMDDHHMMSS_descrição_curta.sql`
- Sempre incluir bloco de rollback comentado no fim
- Toda nova tabela: PK uuid, `created_at`, `updated_at`, RLS habilitado, policies definidas, audit trigger se PII
- Rodar `npx supabase gen types typescript --local > src/lib/supabase/types.ts` após cada migration

### Componentes React
- Hooks customizados em `modules/<modulo>/hooks/use-*.ts`
- Services (chamadas Supabase) em `modules/<modulo>/services/*.service.ts`
- Sem `useEffect` pra fetch — usar TanStack Query (já no repo)
- Forms: react-hook-form + zod, schema em `modules/<modulo>/schemas/`

### Microcopy
Tom amigável em pt-BR. Ver `docs/DESIGN_SYSTEM.md` seção "Microcopy".

### Commits
Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Português ou inglês, mantém consistência por sessão.

## Comandos importantes

```bash
# Dev local
bun install
bun dev

# Supabase local (opcional pra desenvolvimento)
npx supabase start
npx supabase db reset

# Gerar types do Supabase
npx supabase gen types typescript --local > src/lib/supabase/types.ts

# Migration nova
npx supabase migration new <nome>

# Aplicar migrations no projeto cloud
npx supabase db push

# Build
bun run build

# Lint
bun run lint
```

## Roadmap atual

Ver `docs/PLANEJAMENTO.md` seção 5. Estado:

- [x] Fase 0 — fundação (em andamento)
- [ ] Fase 1 — Jornada de Conhecimento
- [ ] Fase 2 — Admissão
- [ ] Fase 3 — Recrutamento e Seleção
- [ ] Fase 4 — Folha (controle)
- [ ] Fase 5 — Agentes IA (Analista + Recruiter)

Cada fase é PR(s) próprias com merge em `main` quando estável.

## Ao começar uma sessão de trabalho

1. Lê `docs/PLANEJAMENTO.md` se não tem certeza do escopo
2. Lê o ADR relevante se a tarefa toca decisão arquitetural
3. Verifica skills disponíveis em `.claude/skills/` antes de modelar/escrever do zero
4. Se a tarefa é nova feature, cria branch `feat/<modulo>-<descricao>`
5. Toda mudança em schema → migration + tipos regenerados + RLS

## O que NUNCA fazer

- Calcular folha CLT (encargos, INSS, IRRF, FGTS) — fora do escopo
- Criar tabela sem RLS
- Criar tabela com PII sem audit trigger
- Permitir que agente IA escreva sem aprovação humana
- Logar dado pessoal (CPF, RG, salário) em texto plano
- Migration sem bloco de rollback
- Commitar `.env` (já no `.gitignore`, mas vale lembrar)
- Usar `console.log` em código de produção (use logger estruturado)

## Pendências conhecidas

- [ ] Limpeza completa do código SaaS herdado (ver `PR1-LIMPEZA.md`)
- [ ] Lista de CNPJs do grupo Softcom
- [ ] Decisão WhatsApp Evolution: v1 ou backlog
- [ ] Provedor de email transacional (Resend ou AWS SES)
- [ ] Política de retenção LGPD por tabela
- [ ] Domínio interno (algo tipo `gc.softcom.com.br`)
