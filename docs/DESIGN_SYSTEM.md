# DNA Softcom — Design System

Herdado do handoff **Agenda Softcom (AgendaV3)**, que é o padrão de design da casa: mesma estrutura, mesma escala, mesmos componentes. O que muda é a identidade — onde a Agenda usa teal + mustard, o DNA usa **ink quente + laranja Softcom**.

Tom geral: **editorial, light-first, contido.** Densidade onde se trabalha todo dia, respiro onde se decide.

## 1. Princípios

1. **Respiro em forms, densidade em listas.** Cadastrar é raro, listar é diário.
2. **Ilustração só onde ajuda.** Empty states, onboarding, conquistas. Nunca decoração.
3. **Microcopy humana.** Friendly, não infantil. Sério em legal, leve em UX.
4. **Laranja é apontamento, não preenchimento.** Ele marca a ação primária, o item ativo e a marca. Se aparece em muitos lugares na mesma tela, deixa de apontar qualquer coisa.
5. **A sidebar é escura nos dois temas.** É a âncora visual do sistema — a navegação não acompanha o tema, o conteúdo sim.
6. **Cor semântica vem de token, nunca de paleta literal.** `text-success`, não `text-emerald-700`. Paleta literal só onde a cor é *categórica* (distinguir pessoas num calendário, fatores DISC), nunca onde é *status*.
7. **Estados sempre desenhados.** Loading, empty, error nunca genéricos.

## 2. Tokens

### Cores

Tokens em HSL, consumidos via Tailwind (`bg-primary`, `text-success`, `border-border`).

```css
/* Marca — laranja Softcom #F97316 */
--primary: 21 95% 53%;
--primary-foreground: 0 0% 100%;

/* Superfícies (light) — o fundo é off-white quente, nunca branco puro;
   o branco fica reservado às superfícies elevadas */
--background: 60 4% 94%;          /* #F1F1F0 */
--foreground: 240 4% 5%;          /* #0D0D0E ink */
--card: 0 0% 100%;
--muted: 0 0% 98%;                /* #FAFAFA */
--muted-foreground: 240 2% 44%;   /* #6E6E73 */
--border: 60 4% 90%;              /* #E6E6E4 */
--input: 60 4% 84%;               /* #D8D8D5 — mais forte que a borda comum */

/* Status — success é VERDE. Antes era laranja, igual ao primary,
   o que tornava "deu certo" indistinguível de "clique aqui". */
--success: 143 55% 40%;           /* #2EA05A */
--warning: 38 92% 50%;
--destructive: 0 64% 56%;         /* #D64545 */
--info: 217 91% 60%;

/* Sidebar — ink quente, igual nos dois temas */
--sidebar-background: 24 10% 10%; /* #1C1917 */
--sidebar-foreground: 24 5% 64%;  /* #A8A29E */
--sidebar-accent: 24 13% 20%;     /* #3A322D — item ativo */
--sidebar-hover: 24 9% 17%;       /* #2E2926 */
```

No tema escuro o conteúdo migra para a mesma família ink (`--background: 24 10% 10%`) e a sidebar afunda mais (`24 12% 7%`), preservando a hierarquia.

### Tipografia

```css
--font-ui:   'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

**Inter** na interface. Pesos: `400` corpo · `500` labels · `600` subtítulos e CTAs · `700` títulos · `800` h1 e wordmark.

**JetBrains Mono** em dados: números, datas, valores, CPF/CNPJ, matrícula. Use a classe `.mono`, que já liga `font-feature-settings: "tnum"` — sem isso as colunas numéricas não alinham verticalmente.

Duas classes de composição prontas:
- `.label-eyebrow` — rótulo em caixa alta com tracking, abre seções e grupos de menu
- `.page-title` — título de página (26px, extrabold, tracking apertado)

### Spacing

Tailwind padrão. Convenções:
- Cards: `p-6` (espaçoso) ou `p-4` (compacto em listagens)
- Forms: `space-y-6` entre campos
- Listagens: `space-y-2` entre items
- Container página: `max-w-7xl mx-auto px-6 py-8`

### Radius

```css
--radius: 0.625rem;  /* 10px */
```

Escala do handoff, mapeada para o shadcn sem tocar nos componentes:
- `rounded-md` = **7px** — botões, inputs, itens de menu
- `rounded-lg` = **10px** — cards, popovers, modais
- `rounded-xl` = **16px** — superfícies grandes
- Badges usam 5px fixo; avatares, `rounded-full`

### Sombras

Duas apenas, e sem glow:
- `shadow-soft` — repouso (cards)
- `shadow-card` — elevação (modais, popovers, hover de card)

### Componentes base (medidas do handoff)

| | |
|---|---|
| Botão | 40px de altura · 46px em `size="lg"` · raio 7px · clique desloca 1px |
| Input | 46px · fundo de card · borda `--input` · foco vira laranja |
| Badge | 20px · raio 5px · 10.5px peso 700 · CAIXA ALTA com tracking `.06em` |

Variantes de badge para estado: `success`, `warning`, `info`, `soft`, `neutral` — todas em tom suave, porque em listagem o badge sólido pesa demais.

## 3. Componentes

### Layout

- **Sidebar fixa colapsável** à esquerda (logo SoftHouse no topo, módulos no meio, perfil no rodapé)
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

| Contexto | Sério-corporativo (não usar) | SoftHouse (usar) |
|---|---|---|
| Empty state colaboradores | "Nenhum colaborador cadastrado" | "Tá vazio por aqui. Bora cadastrar o primeiro?" |
| Empty state candidatos | "Sem candidatos para esta vaga" | "Ainda não chegou ninguém. Bora divulgar a vaga?" |
| Confirma exclusão | "Confirma a exclusão deste registro?" | "Tem certeza? Essa ação não tem volta." |
| Loading | "Carregando..." | "Buscando os dados..." |
| Salvo | "Operação concluída com sucesso" | "Pronto ✓" |
| CPF inválido | "CPF inválido" | "Esse CPF não tá batendo, dá uma conferida?" |
| CNPJ inválido | "CNPJ inválido" | "Esse CNPJ tá com algo errado, confere aí?" |
| Email duplicado | "Email já cadastrado" | "Esse email já tá no sistema." |
| Onboarding | "Bem-vindo ao SoftHouse" | "Que bom te ver aqui 👋" |
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

**Wordmark "SoftHouse"** em Manrope 800, com pequeno símbolo emerald antes (sugestão: casa estilizada do Phosphor `House` em emerald, ou um círculo com inicial).

```
[●] SoftHouse     ← em Manrope 800
```

Versão MVP. Logo "de verdade" entra quando tiver budget/tempo.

### Favicon

SVG simples emerald, mesma forma do símbolo do wordmark. 32x32 e 16x16 fallback.

## 6. Ilustrações

Biblioteca: **unDraw** (https://undraw.co/illustrations) com cor customizada emerald (`#F97316`).

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
