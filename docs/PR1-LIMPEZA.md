# PR1 — Limpeza do código SaaS

> Antes de qualquer feature nova, remover o que não faz sentido em sistema interno.

## Branch

```
git checkout main
git checkout -b chore/remove-saas-layer
```

## Arquivos/pastas a DELETAR

- [ ] `src/components/dashboard/TrialExpiredDialog.tsx`
- [ ] `src/components/subscription/` (pasta inteira)
- [ ] `src/lib/planUtils.ts`
- [ ] `src/components/landing/` (pasta inteira — landing comercial)
- [ ] `src/pages/landing/` (se existir)
- [ ] `src/pages/pricing/` (se existir)
- [ ] `src/pages/signup/` (signup público — auth interno é diferente)
- [ ] Schema.org JSON-LD em `index.html` (FAQ + Organization comercial)

## Código a REMOVER (manter arquivos, tirar trechos)

### `src/integrations/supabase/types.ts` (regenerar depois das migrations)
- [ ] Não editar manualmente — regenerar com `npx supabase gen types`

### Auth e contextos
- [ ] Remover lógica de trial em `DashboardContext`
- [ ] Remover redirect pro `TrialExpiredDialog`
- [ ] Remover checks de `is_master_admin`
- [ ] Remover funções `canAddCollaborator`, `getPlanLimit`

### Rotas
- [ ] Remover rotas públicas: `/`, `/pricing`, `/signup`, `/login` virar a página inicial
- [ ] Login redireciona pra dashboard direto
- [ ] Sem fluxo de "criar conta de empresa" — admin G&C cria empresas via tela interna

### `index.html`
- [ ] Trocar `<title>` pra "SoftHome"
- [ ] Remover meta tags comerciais (description, og marketing)
- [ ] Remover ambos JSON-LD (FAQ e Organization)
- [ ] Atualizar favicon

### `package.json`
- [ ] Trocar `name` pra `softhome`
- [ ] Trocar `description`
- [ ] Bumpar version pra `0.1.0`

### `README.md`
- [ ] Reescrever do zero: descrição interna, stack, comandos, link pro CLAUDE.md

## Mudanças em SCHEMA (separar em PR2)

Não fazer junto desta PR. Próxima PR cuida.

## Mudanças VISUAIS (separar em PR3)

Aplicar `DESIGN_SYSTEM.md` (Manrope, emerald accent, Phosphor) — depois da limpeza.

## Checklist final antes de mergear PR1

- [ ] App ainda compila: `bun run build` sem erro
- [ ] App roda: `bun dev` abre tela de login
- [ ] Login funciona com user existente
- [ ] Dashboard abre sem erros no console
- [ ] Não tem mais nenhuma referência a "plano", "trial", "subscription", "pricing" em busca grep
- [ ] `git grep -i "trial\|subscription\|pricing\|plan_tier"` retorna vazio (ou só em migrations antigas que não vamos rodar)

## Comandos úteis pra busca

```bash
# encontrar referências a remover
git grep -l "TrialExpired"
git grep -l "PaymentModal"
git grep -l "planUtils"
git grep -l "is_master_admin"
git grep -l "canAddCollaborator"

# checar imports quebrados depois de deletar
bun run build
```

## Commit

```
chore: remove SaaS commercial layer for internal-only operation

- Remove trial/subscription/pricing flows
- Remove commercial landing page and FAQ
- Remove master admin (multi-tenant master role)
- Remove plan limits and billing utils
- Update package.json and index.html for SoftHome branding

This PR strips the meurh fork down to its core RH features
for internal Softcom use. No schema changes yet.
```
