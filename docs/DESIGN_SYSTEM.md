# SoftHome — Design System

Tom geral: **friendly/amigável, light-first, denso quando útil, espaçoso quando humano.**

## 1. Princípios

1. **Respiro em forms, densidade em listas.** Cadastrar é raro, listar é diário.
2. **Ilustração só onde ajuda.** Empty states, onboarding, conquistas. Nunca decoração.
3. **Microcopy humana.** Friendly, não infantil. Sério em legal, leve em UX.
4. **Emerald é herói, não vilão.** CTA primário, sucesso, badge ativo. Não fundo de página.
5. **Estados sempre desenhados.** Loading, empty, error nunca genéricos.

## 2. Tokens

### Cores

```css
/* Primary — emerald */
--primary: 158 64% 40%;          /* #10b981 */
--primary-foreground: 0 0% 100%;

/* Background light */
--background: 0 0% 100%;
--foreground: 222 47% 11%;

/* Background dark (dark mode) */
--background-dark: 222 47% 11%;
--foreground-dark: 210 40% 98%;

/* Muted (cards, inputs) */
--muted: 210 40% 96%;
--muted-foreground: 215 16% 47%;

/* Borders */
--border: 214 32% 91%;

/* Status */
--success: 158 64% 40%;          /* mesma do primary, emerald */
--warning: 38 92% 50%;            /* amber-500 */
--danger: 0 84% 60%;              /* red-500 */
--info: 217 91% 60%;              /* blue-500 */
```

Usa via Tailwind: `bg-primary`, `text-primary-foreground`, `border-border`, etc.

### Tipografia

```css
font-family: 'Manrope', system-ui, sans-serif;
```

Uma família só (Manrope) em todos os pesos. Pesos usados:
- `300` light — números grandes em dashboard
- `400` regular — corpo
- `500` medium — labels, navegação
- `600` semibold — subtítulos, CTAs
- `700` bold — títulos h2/h3
- `800` extrabold — h1, wordmark logo

Tamanhos seguem escala Tailwind padrão (`text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, etc).

### Spacing

Tailwind padrão. Convenções:
- Cards: `p-6` (espaçoso) ou `p-4` (compacto em listagens)
- Forms: `space-y-6` entre campos
- Listagens: `space-y-2` entre items
- Container página: `max-w-7xl mx-auto px-6 py-8`

### Radius

```css
--radius: 0.5rem;  /* 8px — padrão shadcn */
```

Botões e inputs com `rounded-md` (6px). Cards com `rounded-lg` (8px). Avatares com `rounded-full`.

### Sombras

Sutis. Tailwind `shadow-sm` em cards default, `shadow-md` em modais/sheets, `shadow-lg` em popovers. Sem `shadow-xl`/`2xl` — pesado demais pra interface diária.

## 3. Componentes

### Layout

- **Sidebar fixa colapsável** à esquerda (logo SoftHome no topo, módulos no meio, perfil no rodapé)
- **Top bar** com breadcrumb + busca global + notificações + avatar
- **Main content** com `max-w-7xl mx-auto`

### Listagem (DataTable)

TanStack Table. Toda lista importante (colaboradores, candidatos, lançamentos) tem:
- Busca textual
- Filtros (regime, status, área, etc)
- Ordenação por coluna
- Seleção em massa (quando aplicável)
- Paginação ou virtualização (se >100 items)
- Export (CSV/Excel) — botão sempre presente
- Empty state ilustrado quando filtro ou tabela vazios

### Forms

react-hook-form + zod. Padrão:
- Sheet lateral pra edits rápidos (uma seção, ≤8 campos)
- Página dedicada pra forms longos (admissão, vaga)
- Validação inline (não só no submit)
- Botão primário emerald, secundário ghost
- "Salvar" sempre à direita, "Cancelar" à esquerda

### Modais vs Sheets

- **Dialog (modal centralizado):** confirmações destrutivas, "tem certeza?"
- **Sheet (lateral direita):** edits, formulários médios, detalhes
- **Página:** forms longos, fluxos multi-step

### Cards

```
┌─────────────────────────────┐
│ [icon]  Título do card     │  ← p-6, font-semibold
│         Subtítulo opcional  │  ← text-muted-foreground text-sm
├─────────────────────────────┤
│  Conteúdo                   │
│                             │
└─────────────────────────────┘
```

### Empty states

Sempre com ilustração (unDraw em emerald via filtro CSS) + título amigável + CTA.

```
   [ ilustração ]

   Tá vazio por aqui

   Cadastra o primeiro colaborador
   pra começar.

   [ + Novo colaborador ]
```

### Ícones

**Phosphor Icons** (`@phosphor-icons/react`). Variant `regular` por padrão, `bold` em ícones de navegação selecionados.

Convenção: import único `import { House, User, Briefcase } from '@phosphor-icons/react'`.

## 4. Microcopy

Tom: amigável em pt-BR brasileiro. Direto, sem rebuscar. Emoji só em contextos de boas-vindas/conquista (👋, ✓, 🎉) — nunca em erros, ações destrutivas, ou listas de trabalho.

### Tabela de exemplos

| Contexto | Sério-corporativo (não usar) | SoftHome (usar) |
|---|---|---|
| Empty state colaboradores | "Nenhum colaborador cadastrado" | "Tá vazio por aqui. Bora cadastrar o primeiro?" |
| Empty state candidatos | "Sem candidatos para esta vaga" | "Ainda não chegou ninguém. Bora divulgar a vaga?" |
| Confirma exclusão | "Confirma a exclusão deste registro?" | "Tem certeza? Essa ação não tem volta." |
| Loading | "Carregando..." | "Buscando os dados..." |
| Salvo | "Operação concluída com sucesso" | "Pronto ✓" |
| CPF inválido | "CPF inválido" | "Esse CPF não tá batendo, dá uma conferida?" |
| CNPJ inválido | "CNPJ inválido" | "Esse CNPJ tá com algo errado, confere aí?" |
| Email duplicado | "Email já cadastrado" | "Esse email já tá no sistema." |
| Onboarding | "Bem-vindo ao SoftHome" | "Que bom te ver aqui 👋" |
| Documento aprovado | "Documento aprovado" | "Documento ok ✓" |
| Documento rejeitado | "Documento rejeitado" | "Esse documento precisa de ajuste. Veja o motivo." |
| Insígnia conquistada | "Insígnia obtida com sucesso" | "Conquistou uma insígnia! 🎉" |
| Erro genérico | "Ocorreu um erro inesperado" | "Algo não foi bem aqui. Tenta de novo?" |
| Sessão expirada | "Sua sessão expirou" | "Faz tempo que tu não mexe. Loga de novo?" |
| Folha fechada | "Período de folha encerrado" | "Folha do mês fechada ✓" |
| Alerta prazo | "Prazo de fechamento em 3 dias" | "Faltam 3 dias pro fechamento da folha." |

### Mantém sério em

- Termos legais e LGPD
- Audit log
- Holerite/contracheque
- Documento oficial
- Aviso de exclusão de dados pessoais
- Erro crítico de sistema (com código pra suporte)

### Padrão de botões

| Ação | Texto | Cor |
|---|---|---|
| Confirmar/Salvar | "Salvar" / "Confirmar" / "Cadastrar" | Emerald (primary) |
| Cancelar | "Cancelar" / "Voltar" | Ghost |
| Excluir | "Excluir" / "Remover" | Vermelho (danger) |
| Aprovar | "Aprovar" | Emerald |
| Rejeitar | "Rejeitar" / "Pedir ajuste" | Vermelho ou amber |

Verbo no infinitivo ou imperativo, nunca "Sim/Não" em diálogos importantes.

## 5. Logo

**Wordmark "SoftHome"** em Manrope 800, com pequeno símbolo emerald antes (sugestão: casa estilizada do Phosphor `House` em emerald, ou um círculo com inicial).

```
[●] SoftHome     ← em Manrope 800
```

Versão MVP. Logo "de verdade" entra quando tiver budget/tempo.

### Favicon

SVG simples emerald, mesma forma do símbolo do wordmark. 32x32 e 16x16 fallback.

## 6. Ilustrações

Biblioteca: **unDraw** (https://undraw.co/illustrations) com cor customizada emerald (`#10b981`).

Salvar em `src/shared/illustrations/` como SVGs. Componentes wrapper:

```tsx
// src/shared/illustrations/EmptyCollaborators.tsx
import EmptyCollaboratorsSvg from './empty-collaborators.svg?react';
export const EmptyCollaborators = (props: SVGProps<SVGSVGElement>) =>
  <EmptyCollaboratorsSvg {...props} />;
```

Lista inicial necessária:
- `empty-collaborators` — listagem vazia de colaboradores
- `empty-candidates` — sem candidatos na vaga
- `empty-badges` — colaborador sem insígnias
- `empty-payroll` — período sem lançamentos
- `welcome` — onboarding inicial
- `success-admission` — admissão concluída
- `congrats-badge` — conquista de insígnia
- `error-generic` — fallback de erro

## 7. Acessibilidade

- Contraste mínimo AA (4.5:1) em texto, 3:1 em UI
- Focus visível em tudo (ring emerald)
- Labels em todos inputs (não só placeholder)
- `aria-label` em botões de ícone puro
- Modais com trap de foco e ESC pra fechar
- Tabelas com `<th scope="col">`

## 8. Dark mode

Implementação padrão shadcn (CSS variables + classe `dark` no root). Toggle no perfil do usuário, persistido em localStorage. Não é o foco — light é o padrão.
