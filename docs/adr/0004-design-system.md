# ADR 0004 — Design System

**Data:** 2026-04-27
**Status:** Aceito

## Contexto

Sistema usado diariamente por time de G&C. Tema sério (RH, dados pessoais, decisões trabalhistas) com necessidade de aproximação humana. Solo dev sem designer. Identidade SoftHome a criar do zero.

## Decisão

Detalhamento completo em `docs/DESIGN_SYSTEM.md`. Resumo das escolhas:

- **Personalidade:** friendly/amigável (referência: Gusto)
- **Modo:** light-first com dark opcional
- **Densidade:** híbrida — denso em listagens, espaçoso em forms
- **Cor accent:** emerald (#10b981) — única cor de marca
- **Tipografia:** Manrope em todos os pesos, fonte única
- **Ícones:** Phosphor Icons
- **Componentes base:** shadcn/ui
- **Ilustrações:** unDraw em emerald, em estados vazios e conquistas
- **Logo v0:** wordmark "SoftHome" Manrope 800 + ícone emerald simples

## Alternativas consideradas

### Linear-like (dark-first, denso, sem ilustração)
**Rejeitada.** Tema RH pede mais calor humano. G&C não é eng team.

### Notion-like (claro, neutro, ilustrações abstratas)
**Considerada.** Viável, mas falta personalidade de marca.

### Tako-like (dark, serifada, premium)
**Rejeitada.** Tako é produto comercial vendendo pra C-level. SoftHome é interno operacional. Tom diferente.

### Material Design / Ant Design
**Rejeitada.** Estética datada, vira "sistema corporativo genérico".

### shadcn padrão sem personalização
**Rejeitada.** Vira indistinguível de outros 10mil produtos shadcn.

## Consequências

### Positivas
- Identidade visual consistente desde dia 1
- Microcopy define tom desde o início (evita inconsistência)
- Decisões tomadas evita "paralisia de design" durante dev

### Negativas
- Ilustrações precisam ser baixadas/ajustadas (trabalho manual inicial)
- Manrope precisa ser carregada (peso adicional ~30kb com display swap)
- Logo wordmark é v0 — precisará evoluir

## Revisão

Reavaliar quando:
- Time crescer (mais de 1 dev, vai precisar de Figma/biblioteca compartilhada)
- Tiver budget pra designer dedicado
- Logo v0 começar a parecer amador em contextos formais (ex: apresentação à diretoria)
