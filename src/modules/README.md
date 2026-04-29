# `src/modules/`

Cada subpasta agrupa **um módulo do produto** SoftHome. Convenção:

```
modules/<modulo>/
  components/     # componentes específicos do módulo
  hooks/          # hooks customizados (use-*.ts)
  services/       # chamadas Supabase (*.service.ts)
  schemas/        # zod schemas pra forms
  types/          # tipos TS específicos do módulo
  pages/          # páginas roteadas (se o módulo tem rotas próprias)
  routes.tsx      # rotas exportadas pro App.tsx (opcional)
```

## Módulos

| Módulo | Status | Descrição |
|---|---|---|
| `journey` | 🟢 Fase 1 (em implementação) | Jornada de Conhecimento: badges/insígnias, 30/60/90 |
| `admission` | 🟡 Stub | Fase 2: workflow de admissão CLT/PJ/Estagiário |
| `recruitment` | 🟡 Stub | Fase 3: vagas, kanban, triagem IA |
| `payroll` | 🟡 Stub | Fase 4: lançamentos mensais, exportação contábil |
| `core` | 🟡 Stub | Companies, collaborators, auth — base compartilhada |

🟢 = código novo aqui  🟡 = README só, código atual ainda em `src/pages/dashboard/*` (migra quando o módulo for retrabalhado)

## Migração gradual

Código herdado do `meurh` ainda vive em `src/pages/dashboard/*` e `src/components/dashboard/*`. **Não foi mass-refactored** porque:

1. Refactor mecânico sem revisão semântica troca dívida por bagunça.
2. Risk de quebrar imports em dezenas de arquivos.
3. CLAUDE.md: "Don't add features, refactor, or introduce abstractions beyond what the task requires."

A regra: **toda vez que tocar uma feature legada pra evoluir, mova-a pro módulo correto na mesma PR.**
