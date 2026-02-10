
# Plano: Classificacao Proventos/Descontos e Ajustes nos PDFs

## Resumo

Corrigir a classificacao de tipos financeiros em todas as telas e PDFs, e garantir que a logomarca apareca em todos os PDFs gerados.

---

## 1. Classificacao correta dos tipos

**Regra de negocio:**

| Tipo | Categoria | Sinal |
|------|-----------|-------|
| salario | Provento | + |
| adicional | Provento | + |
| beneficio | Provento | + |
| inss | Desconto | - |
| irpf | Desconto | - |
| despesa | Desconto | - |
| vale | Desconto | - |
| custo | Desconto | - |
| fgts | Custo empresa | (separado) |

**Nota:** Vale e Despesa passam a ser Descontos (eram tratados como Proventos em alguns lugares).

---

## 2. Alteracoes no Modal do Colaborador

**Arquivo:** `src/components/collaborators/CollaboratorModal.tsx`

- Na listagem de lancamentos (linha ~1240), alterar a exibicao do valor para incluir sinal:
  - Proventos: texto verde, prefixo `+`
  - Descontos (inss, irpf, despesa, vale, custo): texto vermelho, prefixo `-`
  - FGTS: texto neutro (custo empresa)
- A badge `getEntryTypeVariant` ja marca custo/despesa/inss/irpf como `destructive` - adicionar `vale` tambem

---

## 3. Alteracoes na tela de Relatorios

**Arquivo:** `src/pages/dashboard/RelatoriosPage.tsx`

- Atualizar `earningsTypes` (linha 70) removendo `vale`:
  - De: `["salario", "adicional", "vale"]`
  - Para: `["salario", "adicional"]`
- Atualizar `deductionTypes` (linha 72) adicionando `vale`:
  - De: `["inss", "irpf", "despesa", "custo"]`
  - Para: `["inss", "irpf", "despesa", "custo", "vale"]`
- Na tabela de cada colaborador (linha ~552), mostrar o valor com sinal:
  - Descontos: texto vermelho com prefixo `-`
  - Proventos: texto verde com prefixo `+`

---

## 4. Alteracoes no PDF do Relatorio de Folha

**Arquivo:** `src/lib/exportUtils.ts`

- Refatorar `exportToPDF` para agrupar dados por colaborador (usando `groupEntriesByCollaborator` ou dados ja agrupados)
- Para cada colaborador, gerar uma secao com:
  - Nome do colaborador como subtitulo
  - Tabela com lancamentos mostrando valores com sinal (+/-)
  - Rodape com Proventos, Descontos, Liquido, FGTS
- Ao final, secao de Total Geral
- Atualizar interface `ExportData` para aceitar dados agrupados por colaborador
- A logomarca ja esta implementada neste arquivo

---

## 5. Alteracoes no PDF do Recibo de Pagamento

**Arquivo:** `src/lib/payslipPdfGenerator.ts`

- Atualizar classificacao: mover `vale` de `earningsTypes` para `deductionTypes` (linha 81-84)
- A logomarca ja esta implementada neste arquivo

---

## 6. Logomarca nos PDFs

A logomarca ja foi implementada em ambos os arquivos (`payslipPdfGenerator.ts` e `exportUtils.ts`) na iteracao anterior. Verificar que:
- `handleExportPDF` em `RelatoriosPage.tsx` ja passa `logoUrl` (linha 278) - OK
- `handleGeneratePayslip` ja passa `logoUrl` via `companyDetails.logo_url` (linha 337) - OK

Nenhuma alteracao adicional necessaria para a logomarca.

---

## Detalhes Tecnicos

### Arquivos a modificar:

| Arquivo | Mudanca |
|---------|---------|
| `src/components/collaborators/CollaboratorModal.tsx` | Adicionar sinal +/- e cores nos valores dos lancamentos; adicionar `vale` como destructive |
| `src/pages/dashboard/RelatoriosPage.tsx` | Corrigir `earningsTypes`/`deductionTypes`; adicionar sinal +/- na tabela |
| `src/lib/exportUtils.ts` | Refatorar PDF para agrupar por colaborador com sinais +/- e totais individuais |
| `src/lib/payslipPdfGenerator.ts` | Mover `vale` para `deductionTypes` |

### Logica de exibicao do valor:

```text
Tipos Desconto: inss, irpf, despesa, vale, custo
  -> Exibir: "- R$ 150,00" em vermelho

Tipos Provento: salario, adicional, beneficio
  -> Exibir: "+ R$ 1.500,00" em verde

FGTS (custo empresa):
  -> Exibir: "R$ 120,00" em cinza (sem sinal, separado)
```

### Estrutura do PDF do Relatorio (refatorado):

```text
[Logo] Relatorio de Folha de Pagamento
Empresa: XXX | Competencia: XXX

--- Colaborador: Joao Silva ---
| Tipo     | Descricao    | Valor        |
| Salario  | Salario-Base | + R$ 2.000   |
| INSS     | INSS 7,5%    | - R$ 150     |
| IRPF     | IRPF 15%     | - R$ 300     |
  Proventos: R$ 2.000 | Descontos: R$ 450 | Liquido: R$ 1.550 | FGTS: R$ 160

--- Colaborador: Maria Santos ---
...

=== TOTAL GERAL ===
Proventos | Descontos | Liquido | FGTS | Custo Total
```
