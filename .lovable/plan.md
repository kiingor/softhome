

# Plano Atualizado: Sistema de Controle de Exames Ocupacionais

Este plano incorpora todas as funcionalidades ja descritas anteriormente, com o acrescimo dos **filtros avancados** e **impressao/exportacao** na listagem de exames.

---

## Acrescimos ao Plano Original

### Filtros na Listagem de Exames (`ExamesPage.tsx`)

A aba "Todos os Exames" tera os seguintes filtros combinaveis:

| Filtro | Tipo de Componente | Opcoes |
|--------|--------------------|--------|
| Colaborador | Input de busca por nome | Texto livre |
| Status | Select | Todos, Pendente, Agendado, Realizado, Vencido, Cancelado |
| Tipo de Exame | Select | Todos, Admissional, Periodico, Mudanca de Funcao, Retorno ao Trabalho, Demissional, Avulso |
| Periodo (Data) | Dois campos de data (De/Ate) | Filtra por `due_date` ou `completed_date` |

Os filtros funcionam de forma combinada (AND), seguindo o mesmo padrao ja utilizado na pagina de Ferias (`FeriasPage.tsx`).

### Impressao e Exportacao

Botoes no topo da listagem filtrada:

- **Exportar PDF**: Gera relatorio com cabecalho da empresa (nome, CNPJ, logo), data de geracao, e tabela com todos os exames filtrados. Usa `jsPDF` + `jspdf-autotable`, mesmo padrao de `src/lib/exportUtils.ts`.
- **Exportar Excel**: Gera planilha com colunas: Colaborador, Tipo, Status, Grupo de Risco, Data Limite, Data Agendada, Data Realizada, ASO Enviado. Usa `xlsx`, mesmo padrao existente.
- **Imprimir**: Abre janela de impressao do navegador (`window.print()`) com a tabela atual formatada, ou alternativamente gera o PDF e abre para impressao.

Os exports respeitam os filtros ativos (so exportam os dados filtrados).

---

## Resumo Completo do Plano (com acrescimos)

### Banco de Dados

1. ALTER TABLE `positions` - adicionar `risk_group` (text) e `exam_periodicity_months` (integer)
2. CREATE TABLE `occupational_exams` com RLS (modulo `exames`)
3. CREATE TABLE `exam_documents` com RLS (sem DELETE)
4. CREATE storage bucket `exam-documents` (privado)
5. Trigger `auto_create_admission_exam` em collaborators
6. Funcao de geracao de periodicos ao completar exame

### Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/pages/dashboard/ExamesPage.tsx` | Pagina principal com filtros, abas, e botoes de exportacao |
| `src/components/exames/ExamRequestModal.tsx` | Modal de exame avulso |
| `src/components/exames/ExamUploadModal.tsx` | Modal de upload de ASO com versionamento |
| `src/components/exames/ExamCalendar.tsx` | Calendario visual de exames |
| `src/components/exames/PositionChangeDialog.tsx` | Dialog de troca de funcao |
| `src/hooks/useExams.ts` | Hook com queries, mutations e tipos |
| `src/pages/colaborador/MeusExamesPage.tsx` | Portal do colaborador (leitura) |
| `src/lib/riskGroupDefaults.ts` | Constantes NR-7 por grupo de risco |
| `src/lib/examExportUtils.ts` | Funcoes de exportacao PDF/Excel para exames |

### Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/dashboard/CargosPage.tsx` | Campos grupo de risco e periodicidade |
| `src/components/collaborators/CollaboratorModal.tsx` | Cargo travado, troca de funcao, aba exames |
| `src/components/dashboard/DashboardSidebar.tsx` | Item "Exames" no menu |
| `src/App.tsx` | Rotas /dashboard/exames e /colaborador/exames |
| `src/components/portal/PortalLayout.tsx` | Link "Meus Exames" |
| `src/pages/colaborador/PortalHome.tsx` | Quick link "Meus Exames" |

### Detalhes da ExamesPage (UI)

**Cards de resumo**: Pendentes, Vencidos, Proximos 30 dias, Realizados no mes

**Aba "Todos os Exames"**:
- Barra de filtros: Input busca colaborador + Select status + Select tipo + Campos data de/ate
- Botoes de acao: "Novo Exame Avulso" + "Exportar PDF" + "Exportar Excel" + "Imprimir"
- Tabela: Colaborador, Tipo, Status (badge colorido), Grupo de Risco, Data Limite, Data Realizada, ASO (icone), Acoes
- Acoes por linha: Agendar, Marcar Realizado, Enviar ASO, Cancelar

**Aba "Vencimentos"**: Lista ordenada por urgencia com indicadores visuais

**Aba "Calendario"**: Visao mensal dos exames

### Sequencia de Implementacao

1. Migracoes SQL (tabelas, triggers, RLS, storage)
2. Constantes de grupo de risco
3. Cadastro de cargos (novos campos)
4. Hook `useExams.ts`
5. `examExportUtils.ts` (PDF/Excel)
6. `CollaboratorModal.tsx` (cargo travado, troca funcao, aba exames)
7. Sidebar e permissoes (modulo exames)
8. `ExamesPage.tsx` com filtros e exportacao
9. Modais (exame avulso, upload ASO)
10. Portal do colaborador (MeusExamesPage)
11. Rotas e links

