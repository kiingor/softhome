

# Plano: Cargo Travado, Troca de Funcao e Modal de Exame Melhorado

## Visao Geral

Tres mudancas principais:
1. No cadastro do colaborador, travar o campo cargo apos salvar e adicionar botao "Trocar Funcao" com popup de confirmacao que avisa sobre alteracao salarial e gera exame automatico
2. No modal de novo exame, permitir selecionar tipo (admissional, periodico, mudanca_funcao, retorno_trabalho, demissional, avulso) com campo de nome personalizado para avulso
3. Na listagem de exames, filtrar por padrao os ultimos 30 dias (do dia atual para tras)

---

## 1. Cargo Travado no CollaboratorModal

### Comportamento atual
- O campo `position_id` e um Select editavel tanto para novos quanto existentes
- Ao trocar posicao diretamente, o useEffect deleta os lancamentos de salario/impostos do mes atual e recria com os novos valores

### Novo comportamento
- **Novo colaborador**: Select normal (editavel)
- **Colaborador existente com cargo definido**: Campo travado (read-only), exibe nome do cargo + salario como texto/badge, e um botao "Trocar Funcao"
- O botao abre o `PositionChangeDialog` (ja existente em `src/components/exames/PositionChangeDialog.tsx`)
- Ao confirmar:
  - Atualiza `position_id` do colaborador no banco
  - Cria novos lancamentos de salario/impostos APENAS para o mes atual e futuros (nao altera meses passados)
  - Se grupo de risco mudou: cria exame `mudanca_funcao` automaticamente
  - Exibe mensagem: "Cargo atualizado. Valores de salario e impostos serao aplicados a partir deste mes. Um exame de Mudanca de Funcao foi criado."
- A logica atual no `useEffect` que monitora `formData.position_id` sera ajustada para nao disparar em colaboradores existentes (sera tratada exclusivamente pelo fluxo de troca de funcao)

---

## 2. Modal de Novo Exame com Tipo Selecionavel

### Comportamento atual
- O `ExamRequestModal` esta fixo em tipo "avulso"
- Titulo: "Novo Exame Avulso"

### Novo comportamento
- Renomear titulo para "Novo Exame"
- Adicionar campo Select "Tipo de Exame" com opcoes:
  - Admissional, Periodico, Mudanca de Funcao, Retorno ao Trabalho, Demissional, Avulso
- Quando tipo "avulso" selecionado, exibir campo extra "Nome do Exame" (Input texto) para o usuario definir um nome personalizado (salvo no campo `notes` ou num campo extra)
- Badge dinamica mostrando o tipo selecionado

---

## 3. Filtro Padrao de 30 Dias na Listagem

### Comportamento atual
- Campos `dateFrom` e `dateTo` iniciam vazios (mostra tudo)

### Novo comportamento
- `dateFrom` inicia com data de 30 dias atras (formato YYYY-MM-DD)
- `dateTo` inicia com data atual
- Usuario pode alterar livremente os filtros

---

## Detalhes Tecnicos

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/collaborators/CollaboratorModal.tsx` | Travar campo cargo para existentes, adicionar botao "Trocar Funcao", importar e usar `PositionChangeDialog`, ajustar useEffect de position_id |
| `src/components/exames/ExamRequestModal.tsx` | Adicionar Select de tipo, campo nome personalizado para avulso |
| `src/pages/dashboard/ExamesPage.tsx` | Inicializar dateFrom/dateTo com periodo de 30 dias |

### Logica da Troca de Funcao no CollaboratorModal

```text
1. Usuario clica "Trocar Funcao"
2. Abre PositionChangeDialog com cargo atual e lista de cargos
3. Usuario seleciona novo cargo, ve comparacao (salario, grupo de risco)
4. Ao confirmar:
   a. Atualiza collaborators.position_id e collaborators.position
   b. Deleta lancamentos fixos (salario/impostos) APENAS do mes atual
   c. Cria novos lancamentos com valores do novo cargo para o mes atual
   d. Se risk_group diferente: INSERT occupational_exams tipo "mudanca_funcao"
   e. Toast de sucesso com informacao sobre o exame (se criado)
   f. Invalida queries e fecha dialog
```

### Protecao de Meses Passados

A logica de troca de cargo so modifica lancamentos onde `month = mesAtual` e `year = anoAtual`. Lancamentos de meses anteriores permanecem intactos, preservando o historico financeiro.

