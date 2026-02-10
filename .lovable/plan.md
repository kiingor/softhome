
# Plano: Controle de Ferias Completo

## Visao Geral

Implementar um modulo completo de gestao de ferias seguindo as regras da CLT brasileira, com fluxo de solicitacao, aprovacao, calculo automatico de periodos aquisitivos e integracao com o Portal do Colaborador.

---

## Regras de Negocio (CLT)

- **Periodo Aquisitivo**: A cada 12 meses de trabalho, o colaborador adquire direito a 30 dias de ferias
- **Periodo Concessivo**: A empresa tem 12 meses apos o periodo aquisitivo para conceder as ferias
- **Fracionamento**: As ferias podem ser divididas em ate 3 periodos (um deles com no minimo 14 dias corridos, os demais com no minimo 5 dias cada)
- **Abono Pecuniario**: O colaborador pode vender ate 1/3 das ferias (10 dias)
- **Aviso**: A empresa deve comunicar as ferias com pelo menos 30 dias de antecedencia
- **Status do fluxo**: Pendente -> Aprovada -> Em Gozo -> Concluida (ou Rejeitada/Cancelada)

---

## 1. Banco de Dados

### Tabela `vacation_periods` (Periodos Aquisitivos)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | |
| collaborator_id | uuid FK | Colaborador |
| company_id | uuid FK | Empresa |
| start_date | date | Inicio do periodo aquisitivo |
| end_date | date | Fim do periodo aquisitivo (start + 12 meses) |
| days_entitled | integer | Dias de direito (padrao 30) |
| days_taken | integer | Dias ja gozados |
| days_sold | integer | Dias vendidos (abono) |
| days_remaining | integer | Dias restantes (calculado via trigger) |
| status | text | pending, available, partially_used, used, expired |
| created_at | timestamptz | |

### Tabela `vacation_requests` (Solicitacoes de Ferias)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | |
| collaborator_id | uuid FK | Colaborador |
| company_id | uuid FK | Empresa |
| vacation_period_id | uuid FK | Periodo aquisitivo referente |
| start_date | date | Inicio das ferias |
| end_date | date | Fim das ferias |
| days_count | integer | Qtd de dias |
| sell_days | integer | Dias de abono pecuniario (0 ou ate 10) |
| status | text | pending, approved, rejected, in_progress, completed, cancelled |
| requested_by | uuid | Quem solicitou |
| approved_by | uuid | Quem aprovou/rejeitou |
| approved_at | timestamptz | Data da aprovacao |
| rejection_reason | text | Motivo da rejeicao |
| notes | text | Observacoes |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### RLS Policies

- SELECT: `can_view_module(ferias)` + colaboradores podem ver os proprios
- INSERT: `has_module_permission(ferias, can_create)` + colaboradores podem solicitar as proprias
- UPDATE: `has_module_permission(ferias, can_edit)` para aprovar/rejeitar
- DELETE: `has_module_permission(ferias, can_delete)`

### Trigger de calculo

- Ao inserir/atualizar `vacation_requests` com status `completed`, atualizar `days_taken` em `vacation_periods`
- Ao criar um colaborador com `admission_date`, gerar automaticamente o primeiro `vacation_period`

---

## 2. Pagina de Ferias (Dashboard) - `FeriasPage.tsx`

Refatorar completamente a pagina placeholder atual com:

### 2.1 Cards de Resumo (topo)
- **Solicitacoes Pendentes**: quantidade aguardando aprovacao
- **Colaboradores em Ferias**: quantidade atualmente em gozo
- **Proximas Ferias**: proximas ferias agendadas (aprovadas)
- **Periodos Vencendo**: periodos aquisitivos prestes a expirar (< 60 dias)

### 2.2 Abas

**Aba "Solicitacoes"** (padrao)
- Tabela com: Colaborador, Periodo, Data Inicio, Data Fim, Dias, Abono, Status, Acoes
- Filtros: Status (Pendente/Aprovada/Rejeitada/Em Gozo/Concluida), Busca por nome
- Botao "Nova Solicitacao" (para RH/gestor registrar ferias de qualquer colaborador)
- Acoes por linha: Aprovar, Rejeitar (com motivo), Cancelar, Visualizar detalhes

**Aba "Periodos Aquisitivos"**
- Tabela com: Colaborador, Periodo Aquisitivo (datas), Dias de Direito, Dias Gozados, Dias Vendidos, Saldo, Status
- Indicador visual: verde (disponivel), amarelo (parcialmente usado), vermelho (vencendo), cinza (expirado)
- Filtro por status e busca por colaborador

**Aba "Calendario"** (visual)
- Visao mensal mostrando quais colaboradores estarao de ferias em quais periodos
- Barras coloridas horizontais por colaborador

### 2.3 Modal de Nova Solicitacao / Registro de Ferias
- Select de Colaborador (com busca)
- Exibe automaticamente os periodos aquisitivos disponiveis
- Campos: Data Inicio, Data Fim (calcula dias automaticamente)
- Checkbox "Abono Pecuniario" com campo de dias (maximo 10, ou 1/3 do saldo)
- Validacoes:
  - Minimo 14 dias se for periodo unico, ou fracionamento valido (14 + 5 + 5)
  - Nao pode exceder saldo disponivel
  - Nao pode sobrepor com outras ferias do mesmo colaborador
- Observacoes (textarea)

---

## 3. Cadastro do Colaborador - `CollaboratorModal.tsx`

### Nova aba "Ferias" no modal do colaborador

- Exibir lista de periodos aquisitivos com saldo
- Exibir historico de ferias (solicitacoes concluidas)
- Botao "Registrar Ferias" abrindo o modal de solicitacao pre-preenchido
- Indicador visual do proximo periodo aquisitivo

### Campo `admission_date` obrigatorio

- Ao salvar colaborador com `admission_date`, gerar automaticamente os periodos aquisitivos (desde a admissao ate hoje)

---

## 4. Portal do Colaborador

### Nova pagina `MinhasFeriasPage.tsx`

- Card com saldo de ferias atual (dias disponiveis)
- Lista de periodos aquisitivos com dias restantes
- Historico de ferias gozadas
- Botao "Solicitar Ferias" (abre modal simplificado)
- Status das solicitacoes pendentes com timeline visual

### Atualizacao do `PortalHome.tsx`

- Adicionar card "Minhas Ferias" nos quick links
- Mostrar badge se houver solicitacoes pendentes

### Nova rota em `App.tsx`

- `/colaborador/ferias` -> `MinhasFeriasPage`

---

## 5. Sidebar do Dashboard

- Adicionar item "Ferias" na categoria "Gestao" do menu lateral
- Icone: `Calendar` ou `Palmtree`
- Modulo: `ferias`

---

## 6. Funcao de Geracao de Periodos Aquisitivos

Funcao SQL `generate_vacation_periods(collaborator_id, admission_date)`:
- Calcula todos os periodos aquisitivos desde a admissao ate a data atual
- Cria registros na tabela `vacation_periods`
- Chamada via trigger ao inserir/atualizar `admission_date` no collaborator

---

## Detalhes Tecnicos

### Arquivos a criar:

| Arquivo | Descricao |
|---------|-----------|
| `src/pages/dashboard/FeriasPage.tsx` | Reescrita completa da pagina |
| `src/components/ferias/VacationRequestModal.tsx` | Modal de solicitacao/registro |
| `src/components/ferias/VacationCalendar.tsx` | Visao calendario mensal |
| `src/components/ferias/VacationPeriodsList.tsx` | Lista de periodos aquisitivos |
| `src/pages/colaborador/MinhasFeriasPage.tsx` | Pagina do portal do colaborador |
| `src/hooks/useVacations.ts` | Hook com queries e mutations |

### Arquivos a modificar:

| Arquivo | Mudanca |
|---------|---------|
| `src/components/dashboard/DashboardSidebar.tsx` | Adicionar item "Ferias" na categoria Gestao |
| `src/components/collaborators/CollaboratorModal.tsx` | Adicionar aba/secao de ferias |
| `src/pages/colaborador/PortalHome.tsx` | Adicionar quick link "Minhas Ferias" |
| `src/App.tsx` | Adicionar rota `/colaborador/ferias` |
| `src/components/portal/PortalLayout.tsx` | Adicionar link de ferias no menu do portal |

### Migracoes SQL:

1. Criar tabela `vacation_periods` com RLS
2. Criar tabela `vacation_requests` com RLS
3. Criar funcao `generate_vacation_periods()` (SECURITY DEFINER)
4. Criar trigger na tabela `collaborators` para gerar periodos ao definir `admission_date`
5. Criar funcao de atualizacao de saldo ao completar ferias
6. Habilitar realtime em `vacation_requests` para notificacoes

### Fluxo de dados:

```text
Colaborador cadastrado com admission_date
  -> Trigger gera vacation_periods automaticamente

RH cria solicitacao (ou colaborador solicita via portal)
  -> vacation_requests com status "pending"

RH/Gestor aprova
  -> status "approved", approved_by, approved_at

Data de inicio chega
  -> status "in_progress" (pode ser via cron ou manual)

Data de fim chega
  -> status "completed"
  -> Trigger atualiza days_taken no vacation_period
```

### Sequencia de implementacao:

1. Migracoes SQL (tabelas, funcoes, triggers, RLS)
2. Hook `useVacations.ts`
3. Sidebar (adicionar link)
4. `FeriasPage.tsx` completa (abas, tabelas, filtros)
5. `VacationRequestModal.tsx`
6. Aba de ferias no `CollaboratorModal.tsx`
7. `MinhasFeriasPage.tsx` (portal)
8. Rotas e links no portal
