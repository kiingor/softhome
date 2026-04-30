# SoftHouse

Sistema interno de Gente & Cultura da Softcom (~300 colaboradores). Single-tenant, multi-CNPJ.

> Forkado de `kiingor/meurh` (produto SaaS) e em transformação pra sistema interno. Contexto completo em [`CLAUDE.md`](./CLAUDE.md) e [`docs/PLANEJAMENTO.md`](./docs/PLANEJAMENTO.md).

## Stack

- Vite + React 18 + TypeScript
- shadcn/ui + Tailwind v4 (Manrope, emerald, Phosphor — ver [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md))
- Supabase (Postgres + Auth + Storage + Realtime + Edge Functions Deno) — região `sa-east-1`
- TanStack Query + react-hook-form + zod

## Desenvolvimento

```bash
bun install
bun dev

# Supabase local (opcional)
npx supabase start
npx supabase db reset

# Após qualquer migration
npx supabase gen types typescript --local > src/lib/supabase/types.ts

# Build e lint
bun run build
bun run lint
```

## Estrutura

```
src/
  modules/      # admission, recruitment, payroll, journey, core
  shared/       # ui, components, hooks, illustrations, utils
  lib/          # supabase, claude, mcp
  agents/       # analyst, recruiter
supabase/
  migrations/   # SQL versionado, rollback obrigatório
  functions/    # edge functions
docs/
  PLANEJAMENTO.md, DESIGN_SYSTEM.md, adr/
.claude/
  skills/       # skills de dev
```

## Princípios

1. LGPD primeiro — audit log em PII, dado em território nacional.
2. Não calculamos folha CLT; controle + exportação pro contador.
3. Agente IA nunca escreve dado irreversível sem aprovação humana.
4. RLS em toda tabela.
5. Toda migration tem rollback.

## Roadmap

Ver [`docs/PLANEJAMENTO.md`](./docs/PLANEJAMENTO.md) seção 5. Estado atual: Fase 0 (fundação).

## Licença

Uso interno Softcom. Não distribuir.
