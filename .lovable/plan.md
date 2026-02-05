
# Plano: Cálculo Automático de Impostos e Recibo de Pagamento PDF

## Visão Geral

Este plano implementa duas funcionalidades principais:
1. **Cálculo automático de impostos** ao lançar salário do colaborador
2. **Geração de PDF** no formato exato do modelo de Recibo de Pagamento brasileiro

---

## Parte 1: Novos Tipos de Lançamento para Impostos

### 1.1 Migração de Banco de Dados

Adicionar novos valores ao enum `payroll_entry_type`:

```sql
-- Adicionar novos tipos de lançamento
ALTER TYPE payroll_entry_type ADD VALUE 'inss';
ALTER TYPE payroll_entry_type ADD VALUE 'fgts';
ALTER TYPE payroll_entry_type ADD VALUE 'irpf';
```

### 1.2 Estrutura dos Tipos

| Tipo | Descrição | Categoria |
|------|-----------|-----------|
| salario | Salário Base | Provento |
| adicional | Adicional | Provento |
| vale | Vale | Provento |
| beneficio | Benefício | Provento |
| inss | INSS | Desconto |
| irpf | IRPF | Desconto |
| fgts | FGTS | Custo Empresa (rodapé) |
| custo | Custo | Custo |
| despesa | Despesa | Desconto |

---

## Parte 2: Lógica de Cálculo de Impostos

### 2.1 Arquivo: `src/components/payroll/PayrollEntryForm.tsx`

Quando o usuário lançar um **salário** (tipo = "salario"), o sistema:

1. Busca o cargo (`position_id`) do colaborador selecionado
2. Se o cargo tiver percentuais definidos (INSS, FGTS, IRPF), calcula automaticamente:
   - **INSS** = Salário × (inss_percent / 100)
   - **FGTS** = Salário × (fgts_percent / 100)
   - **IRPF** = Salário × (irpf_percent / 100)
3. Cria lançamentos separados para cada imposto com o mesmo mês/ano

### 2.2 Fluxo de Criação

```text
Usuario lança Salário R$ 1.579,00
         |
         v
Sistema busca cargo do colaborador
         |
         v
Cargo tem: INSS 9%, FGTS 8%, IRPF 0%
         |
         v
Sistema cria automaticamente:
  - Salário: R$ 1.579,00 (tipo: salario)
  - INSS: R$ 142,11 (tipo: inss)
  - FGTS: R$ 126,32 (tipo: fgts)
```

---

## Parte 3: PDF no Formato Recibo de Pagamento

### 3.1 Novo Arquivo: `src/lib/payslipPdfGenerator.ts`

Função dedicada para gerar o recibo individual por colaborador.

### 3.2 Estrutura do PDF

```text
+----------------------------------------------------------+
| Recibo de Pagamento               | Data e Assinatura    |
| (Folha de Pagamento)              | ___/___/___          |
+----------------------------------------------------------+
| Empregador             | Inscrição    | Admissão | Competência |
| [EMPRESA]              | [CNPJ]       | [DATA]   | [MÊS/ANO]   |
+----------------------------------------------------------+
| Empregado              | Cargo        | Lotação             |
| [CÓDIGO] [NOME]        | [CARGO]      | [SETOR]             |
+----------------------------------------------------------+
| CPF                 | Banco | Agência | Conta | Tipo Conta  |
| [CPF]               |       |         |       |             |
+----------------------------------------------------------+
|                  Discriminação das Verbas                  |
+------+------------------+------------+----------+----------+
| Cod. | Descrição        | Referência | Provento | Desconto |
+------+------------------+------------+----------+----------+
| 011  | Salário-Base     | 30 dia(s)  | 1.579,00 |          |
| 310  | INSS             | 9%         |          | 119,34   |
| ...  | ...              | ...        | ...      | ...      |
+------+------------------+------------+----------+----------+
|                         | Total de Proventos  | 1.579,00   |
|                         | Total de Descontos  | 119,34     |
|                         | Líquido a Receber   | 1.459,66   |
+----------------------------------------------------------+
| Salário    | Base INSS  | Base FGTS | FGTS     | Base IRRF |
| 1.579,00   | 1.579,00   | 1.579,00  | 126,32   | 1.579,00  |
+----------------------------------------------------------+
```

### 3.3 Códigos das Verbas

| Código | Descrição |
|--------|-----------|
| 011 | Salário-Base |
| 010 | Salário-Família |
| 020 | Adicional |
| 030 | Benefício |
| 310 | INSS |
| 320 | IRPF |
| 100 | Vale |

### 3.4 Separação de Proventos e Descontos

- **Proventos:** salario, adicional, vale, beneficio
- **Descontos:** inss, irpf, despesa
- **Rodapé:** fgts (não desconta do colaborador, é custo empresa)

---

## Parte 4: Modificações nos Arquivos

### 4.1 Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/payroll/PayrollEntryForm.tsx` | Buscar cargo do colaborador e criar lançamentos de impostos automaticamente |
| `src/lib/exportUtils.ts` | Adicionar novos tipos no `typeLabels` |
| `src/lib/payslipPdfGenerator.ts` | **Novo arquivo** - Gerador de PDF individual |
| `src/pages/dashboard/RelatoriosPage.tsx` | Adicionar botão para gerar recibo individual e usar novo gerador |
| `src/pages/dashboard/FinanceiroPage.tsx` | Atualizar `typeLabels` e `typeColors` |
| `src/pages/colaborador/MeuExtratoPage.tsx` | Atualizar para mostrar impostos separadamente |

### 4.2 Migração SQL

```sql
ALTER TYPE payroll_entry_type ADD VALUE 'inss';
ALTER TYPE payroll_entry_type ADD VALUE 'fgts';
ALTER TYPE payroll_entry_type ADD VALUE 'irpf';
```

---

## Parte 5: Detalhes Técnicos

### 5.1 Buscar Cargo do Colaborador

```typescript
// Ao selecionar colaborador, buscar dados do cargo
const { data: collaboratorData } = await supabase
  .from("collaborators")
  .select(`
    id, name, cpf, admission_date,
    position:positions(id, name, salary, inss_percent, fgts_percent, irpf_percent)
  `)
  .eq("id", collaboratorId)
  .single();
```

### 5.2 Criar Lançamentos de Impostos

```typescript
// Após criar lançamento de salário
if (data.type === "salario" && positionData) {
  const salaryValue = parseFloat(data.value);
  const taxEntries = [];
  
  if (positionData.inss_percent > 0) {
    taxEntries.push({
      type: "inss",
      description: `INSS ${positionData.inss_percent}%`,
      value: salaryValue * (positionData.inss_percent / 100),
      // ... outros campos
    });
  }
  
  if (positionData.fgts_percent > 0) {
    taxEntries.push({
      type: "fgts",
      description: `FGTS ${positionData.fgts_percent}%`,
      value: salaryValue * (positionData.fgts_percent / 100),
    });
  }
  
  if (positionData.irpf_percent > 0) {
    taxEntries.push({
      type: "irpf",
      description: `IRPF ${positionData.irpf_percent}%`,
      value: salaryValue * (positionData.irpf_percent / 100),
    });
  }
  
  await supabase.from("payroll_entries").insert(taxEntries);
}
```

### 5.3 Gerar PDF Individual

```typescript
// Estrutura dos dados para o PDF
interface PayslipData {
  company: {
    name: string;
    cnpj: string;
  };
  collaborator: {
    code: string;
    name: string;
    cpf: string;
    admissionDate: string;
    position: string;
    department: string;
  };
  period: {
    month: number;
    year: number;
  };
  entries: {
    code: string;
    description: string;
    reference: string;
    earnings: number | null;  // Provento
    deductions: number | null;  // Desconto
  }[];
  totals: {
    earnings: number;
    deductions: number;
    netPay: number;
  };
  footer: {
    baseSalary: number;
    inssBase: number;
    fgtsBase: number;
    fgtsValue: number;
    irpfBase: number;
  };
}
```

---

## Resumo das Mudanças

1. **Migração SQL:** Adicionar tipos `inss`, `fgts`, `irpf` ao enum
2. **PayrollEntryForm:** Calcular e criar impostos automaticamente ao lançar salário
3. **Novo arquivo PDF:** Gerador de recibo individual no formato brasileiro
4. **RelatoriosPage:** Botão para gerar recibo por colaborador
5. **Atualizar labels:** Todos os arquivos que usam `typeLabels`
