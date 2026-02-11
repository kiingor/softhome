

# Plano: Sistema de Documentos + Onboarding do Colaborador

## Visao Geral

Este plano cobre 5 grandes areas:

1. **Documentos obrigatorios por cargo** (aba nova em Cargos)
2. **Novos status do colaborador** (aguardando_documentacao, validacao_pendente, reprovado)
3. **Fluxo de Primeiro Acesso** (tela step-by-step mobile-first sem autenticacao)
4. **Validacao de documentos pelo RH** (aba no cadastro do colaborador)
5. **Filtro global**: so mostrar colaborador em financeiro/exames/ferias/relatorios quando status = 'ativo'

---

## 1. Banco de Dados

### 1.1 Alterar enum `collaborator_status`

Adicionar novos valores ao enum existente:

```text
ativo, inativo, aguardando_documentacao, validacao_pendente, reprovado
```

### 1.2 Nova tabela `position_documents`

Documentos obrigatorios por cargo:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | |
| position_id | uuid FK positions | |
| company_id | uuid FK companies | |
| name | text | Nome do documento |
| observation | text | Instrucoes/observacao |
| file_type | text | 'pdf', 'image', 'doc' |
| created_at | timestamptz | |

RLS: mesmas permissoes do modulo `cargos`

### 1.3 Nova tabela `onboarding_sessions`

Controla o progresso do fluxo de primeiro acesso:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | |
| collaborator_id | uuid FK | |
| company_id | uuid FK | |
| current_step | integer | 1=dados, 2=financeiro, 3=documentos, 4=concluido |
| data_validated | boolean | Step 1 ok |
| financial_validated | boolean | Step 2 ok |
| documents_completed | boolean | Step 3 ok |
| completed_at | timestamptz | Quando finalizou |
| created_at | timestamptz | |

RLS: acesso publico para SELECT/UPDATE filtrado por CPF (sem autenticacao), ou INSERT com politica permissiva (o colaborador nao esta logado).

**IMPORTANTE**: Como o colaborador nao esta autenticado neste fluxo, as RLS policies precisam ser configuradas com `anon` key ou via uma edge function SECURITY DEFINER. A abordagem recomendada e usar **edge functions** para todas as operacoes do onboarding.

### 1.4 Nova tabela `onboarding_errors`

Sinalizacoes de erro feitas pelo colaborador:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | |
| onboarding_session_id | uuid FK | |
| step | integer | Em qual step foi o erro |
| description | text | O que esta errado |
| created_at | timestamptz | |

### 1.5 Nova tabela `collaborator_documents`

Documentos enviados pelo colaborador:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid PK | |
| collaborator_id | uuid FK | |
| company_id | uuid FK | |
| position_document_id | uuid FK position_documents | Qual documento obrigatorio |
| file_url | text | URL no storage |
| file_name | text | Nome do arquivo |
| status | text | 'pendente', 'aprovado', 'reprovado' |
| rejection_reason | text | Motivo da reprovacao |
| reviewed_by | uuid | Quem validou |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |

### 1.6 Storage bucket

Criar bucket `collaborator-documents` (privado)

---

## 2. Edge Functions para Onboarding

Como o colaborador NAO esta autenticado no fluxo de primeiro acesso, sera necessario criar edge functions:

### `onboarding-lookup`
- Recebe CPF, busca colaborador com status `aguardando_documentacao` ou `reprovado`
- Retorna dados do colaborador, dados da empresa (nome, logo, CNPJ), sessao de onboarding existente ou cria uma nova
- Retorna documentos obrigatorios do cargo e documentos ja enviados

### `onboarding-action`
- Acoes: `validate_step`, `report_error`, `upload_document`, `complete`
- Recebe collaborator_id + acao + dados
- Atualiza a sessao de onboarding
- Ao completar: muda status do colaborador para `validacao_pendente`

### `onboarding-upload`
- Recebe arquivo + collaborator_id + position_document_id
- Salva no bucket `collaborator-documents`
- Cria/atualiza registro em `collaborator_documents`

---

## 3. Pagina de Cargos - Aba Documentos

### Arquivo: `src/pages/dashboard/CargosPage.tsx`

Separar conteudo existente em abas:
- **Aba "Cargos"**: conteudo atual (lista de cargos, formulario)
- **Aba "Documentos por Cargo"**: ao selecionar um cargo, mostra lista de documentos obrigatorios com CRUD (nome, observacao, tipo de arquivo)

---

## 4. Tela de Primeiro Acesso

### Nova rota: `/portal/primeiro-acesso`

### Novo arquivo: `src/pages/colaborador/PrimeiroAcesso.tsx`

Tela mobile-first, responsiva, SEM autenticacao:

**Entrada**: Campo de CPF, botao "Continuar"

**Step 1 - Dados Cadastrais**:
- Header: logo da empresa, nome da empresa
- Mostra: nome, CPF, email, telefone (read-only)
- Botoes: "Avançar" e "Sinalizar Erro"
- Sinalizar erro abre popup com textarea, ao enviar salva em `onboarding_errors` e avanca

**Step 2 - Lancamentos Financeiros e Beneficios**:
- Lista lancamentos financeiros do mes atual (salario, impostos)
- Lista beneficios atribuidos
- Botoes: "Avançar" e "Sinalizar Erro"

**Step 3 - Upload de Documentos**:
- Lista documentos obrigatorios do cargo com nome e observacao
- Barra de progresso (X de Y enviados)
- Botao de upload por documento
- Se documento foi reprovado: mostra motivo + permite reenviar
- Nao precisa enviar todos de uma vez (salva progresso)

**Step 4 - Conclusao**:
- Mensagem: "Seu cadastro foi pre-aprovado e sera validado pela equipe"
- Muda status para `validacao_pendente`

**Persistencia**: Ao voltar com o CPF, retorna ao step onde parou

### Ajuste no PortalLogin

Adicionar botao "Primeiro Acesso" abaixo do formulario de login, que redireciona para `/portal/primeiro-acesso`

---

## 5. Validacao no Cadastro do Colaborador

### Arquivo: `src/components/collaborators/CollaboratorModal.tsx`

Nova aba **"Validação"** (visivel quando status e `validacao_pendente` ou `reprovado`):

- Lista sinalizacoes de erro do onboarding (onboarding_errors)
- Lista de documentos enviados com status (pendente/aprovado/reprovado)
- Botao de download por documento
- Checkbox de aprovado/reprovado por documento
- Se reprovado: popup pedindo motivo
- Botoes globais: **"Aprovar Cadastro"** e **"Reprovar Cadastro"**

**Aprovar**:
- Muda status para `ativo`
- Cria acesso no portal (se email preenchido)
- Lancamentos financeiros e exames passam a ser visiveis

**Reprovar**:
- Pede motivo geral
- Muda status para `reprovado`
- Na listagem principal, mostra botao "Reenviar Documentação"
- Reenviar: deleta sessao de onboarding, documentos, e reabilita para `aguardando_documentacao`

---

## 6. Listagem de Colaboradores

### Arquivo: `src/pages/dashboard/ColaboradoresPage.tsx`

- Abrir cadastro ao clicar na linha inteira (remover botao "Editar" separado)
- Novos badges de status: `aguardando_documentacao` (amarelo), `validacao_pendente` (azul), `reprovado` (vermelho)
- Filtro de status com novos valores
- Botao "Reenviar Documentação" para status `reprovado`

---

## 7. Filtro Global - Status Ativo

### Arquivos impactados:

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/dashboard/FinanceiroPage.tsx` | Filtrar collaborators com `.eq('status', 'ativo')` |
| `src/pages/dashboard/RelatoriosPage.tsx` | Filtrar collaborators com `.eq('status', 'ativo')` |
| `src/pages/dashboard/FeriasPage.tsx` | Filtrar collaborators com `.eq('status', 'ativo')` |
| `src/pages/dashboard/ExamesPage.tsx` | Filtrar exames de collaborators com status `ativo` |
| Triggers SQL (admission exam, vacation periods) | Condicionar a criacao ao status `ativo` |

**Regra**: Lancamentos financeiros, exames automaticos, ferias e relatorios so mostram colaboradores com status `ativo`. O cadastro com status `aguardando_documentacao` nao gera nenhum dado automatico.

---

## 8. Fluxo do Status do Colaborador

```text
Cadastro novo -> aguardando_documentacao
  |
  v
Colaborador faz primeiro acesso -> validacao_pendente
  |
  v
RH aprova -> ativo (financeiro/exames/ferias habilitados)
  ou
RH reprova -> reprovado
  |
  v
RH clica "Reenviar" -> aguardando_documentacao (loop)
```

---

## 9. Sequencia de Implementacao

1. Migracoes SQL (enum, tabelas, RLS, bucket, ajuste triggers)
2. Edge functions (onboarding-lookup, onboarding-action, onboarding-upload)
3. CargosPage - abas + CRUD de documentos por cargo
4. Tela Primeiro Acesso (PrimeiroAcesso.tsx)
5. CollaboratorModal - aba Validacao
6. ColaboradoresPage - click na linha, novos status, reenviar
7. Filtro global (Financeiro, Relatorios, Ferias, Exames)
8. Ajuste no cadastro de novo colaborador (status inicial = aguardando_documentacao)
9. PortalLogin - botao Primeiro Acesso
10. Rotas no App.tsx

### Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/pages/colaborador/PrimeiroAcesso.tsx` | Tela step-by-step |
| `supabase/functions/onboarding-lookup/index.ts` | Busca por CPF |
| `supabase/functions/onboarding-action/index.ts` | Acoes do onboarding |
| `supabase/functions/onboarding-upload/index.ts` | Upload de documentos |

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/dashboard/CargosPage.tsx` | Abas + CRUD documentos |
| `src/components/collaborators/CollaboratorModal.tsx` | Aba Validacao, status inicial |
| `src/pages/dashboard/ColaboradoresPage.tsx` | Click linha, novos status |
| `src/pages/colaborador/PortalLogin.tsx` | Botao Primeiro Acesso |
| `src/App.tsx` | Rota /portal/primeiro-acesso |
| `src/pages/dashboard/FinanceiroPage.tsx` | Filtrar status ativo |
| `src/pages/dashboard/RelatoriosPage.tsx` | Filtrar status ativo |
| `src/pages/dashboard/FeriasPage.tsx` | Filtrar status ativo |
| `src/pages/dashboard/ExamesPage.tsx` | Filtrar status ativo |

