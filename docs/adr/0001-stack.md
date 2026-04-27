# ADR 0001 — Stack tecnológica

**Data:** 2026-04-27
**Status:** Aceito
**Decisores:** kiingor (solo dev/PO/PM)

## Contexto

Sistema interno de RH da Softcom, single-tenant multi-CNPJ, ~300 colaboradores, dev solo. Necessário equilibrar produtividade individual, baixa manutenção operacional, conformidade LGPD e capacidade de evoluir pra agentes IA.

## Decisão

### Frontend
- **Vite + React 18 + TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** como base de componentes
- **TanStack Query** pra estado de servidor
- **TanStack Table** pra listagens
- **react-hook-form + zod** pra formulários
- **Phosphor Icons** pra ícones
- **Manrope** como fonte única
- **Vite SPA hospedada em Vercel ou Cloudflare Pages**

### Backend
- **Supabase Cloud Pro** (Postgres + Auth + Storage + Realtime + Edge Functions)
- **Região sa-east-1** (LGPD: dado em território nacional)
- **Edge Functions em Deno** pra lógica server-side (validação IA, exports, crons)
- **pg_cron** pra jobs agendados

### IA
- **Claude API (Anthropic)** em produção v1
- **MCP server sobre Postgres** pra agentes lerem dados
- Plano de transição pra modelo local (vLLM, Ollama) em fase posterior — não bloqueia v1

### DevOps
- **GitHub** repositório privado
- **Bun** como package manager (mantém o que já tá no `meurh`)
- **Supabase CLI** pra migrations versionadas
- **Vercel** pra preview deploys + produção (ou Cloudflare Pages)

## Alternativas consideradas

### VPS própria (Postgres + Node/Bun + nginx)
**Rejeitada.** Solo dev gastaria semanas só configurando backup, monitoring, auth, storage, realtime, escalabilidade. Tempo melhor investido em features.

### Next.js App Router em vez de Vite SPA
**Rejeitada.** O `meurh` já está em Vite. Refatorar pra Next custaria 1-2 semanas sem ganho real (sistema interno, SEO irrelevante, SSR desnecessário).

### Firebase / AWS Amplify
**Rejeitada.** Vendor lock-in mais profundo que Supabase. LGPD sa-east-1 disponível em ambos, mas Postgres puro do Supabase é mais portável.

### Hospedar Postgres no Brasil em provedor BR (Magalu Cloud, Locaweb)
**Considerado, rejeitado pra v1.** Faz sentido pra escalas maiores ou compliance gov. Pra 300 colaboradores não compensa overhead.

## Consequências

### Positivas
- Setup em horas, não dias
- LGPD resolvido por configuração (sa-east-1 + RLS)
- Auth e Storage prontos
- Realtime nativo pra notificações in-app
- Edge Functions cobrem lógica server sem servidor próprio
- Stack documentada e popular — fácil achar referências

### Negativas
- Vendor lock-in moderado (Supabase). Mitigação: schema padrão Postgres, evitar features muito específicas (Supabase Vault, etc).
- Custo cresce com volume. ~US$25/mês Pro hoje, sobe se Storage > 100GB ou compute alto. Pra 300 colaboradores fica longe disso.
- Edge Functions Deno (não Node). Curva pequena, mas existe.

### Riscos
- **Supabase muda preço/política.** Mitigação: portabilidade do Postgres puro permite migração em semanas, não meses.
- **MCP server expõe banco se mal configurado.** Mitigação: views `agent_*` restritas, RLS impecável, audit log.

## Revisão

Reavaliar em 12 meses ou quando:
- Volume de colaboradores > 1.500
- Storage > 100GB
- Custo Supabase > US$200/mês
- Necessidade de soberania total (gov/regulado)
