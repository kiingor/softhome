# `payroll/` — Folha (Controle, NÃO Cálculo)

**Fase 4** (2-3 semanas no plano).

## Princípio não-negociável

> **Não calculamos folha CLT.** Nada de INSS, IRRF, FGTS, encargos, eSocial. Cálculo CLT = projeto de 9-15 meses, fora do escopo.

O que fazemos: **controle de lançamentos** + **exportação organizada pro contador** que faz o cálculo.

## Escopo

Cada CNPJ tem o próprio fechamento de folha. Lançamentos são alimentados ao longo do mês (alguns automatizados, outros manuais), e no fechamento exportamos o pacote pro escritório contábil.

## Tabelas

- `payroll_periods` — um período por (CNPJ × mês). Status: aberto/fechado/exportado.
- `payroll_entries` — lançamentos do período (referência a colaborador + tipo + valor + observação)
- `payroll_alerts` — alertas pendentes que precisam atenção do RH (atraso, divergência, falta de aprovação)

## Tipos de lançamento (v1)

| Tipo | Origem | Quem cria |
|---|---|---|
| Salário base | Cadastro do colaborador | Automático |
| Hora extra | Manual ou integração ponto | RH/Gestor |
| Falta | Manual | RH/Gestor |
| Atestado | Manual | RH |
| Benefício (VR/VA) | Cadastro de benefícios | Automático |
| Adiantamento | Manual | RH |
| Bonificação | Manual | Gestor (com aprovação) |
| Desconto | Manual | RH (com justificativa) |

## Funcionalidades v1

- Listagem de períodos por CNPJ
- CRUD de lançamentos no período aberto
- Alertas: colaborador sem lançamento, divergência de valor, falta sem atestado
- Fechamento de período (vira read-only)
- Exportação Excel por regime/CNPJ pro contador
- Histórico de exportações (quem, quando, hash do arquivo)

## Diferenciação por regime

| | CLT | PJ | Estagiário |
|---|---|---|---|
| Salário | Base + HE + faltas + benefícios | Valor NF mensal | Bolsa + recesso |
| Lançamentos | Todos | NF + reembolso | Bolsa + auxílio |
| Exportação | Por regime separado | Por regime separado | Por regime separado |

## Edge Functions

- `payroll-export` — gera Excel do período pro contador (formato negociado)
