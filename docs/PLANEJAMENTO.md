# SoftHouse — Planejamento

**Versão:** 1.1
**Status:** Em estruturação
**Fontes:** `Sistema Gente e Cultura.pdf` (PDF G&C — fonte primária), `Apresentação Tako.pdf` (referência de produto), repo `kiingor/meurh` (base técnica)

---

## 1. Decisões arquiteturais

| Decisão | Escolha | Justificativa |
|---|---|---|
| Tipo | Single-tenant interno multi-CNPJ | Softcom + filiais como CNPJs distintos |
| Hospedagem | Supabase Cloud Pro, sa-east-1 | LGPD, PITR, MFA, SSO |
| Base de código | Fork do `meurh` | 70% do setup já pronto; aproveita Vite, Tailwind, shadcn, auth, layout |
| Frontend | Vite + React 18 + TS + shadcn/ui + Tailwind v4 | Mantém o que está no repo |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) + Edge Functions Deno | Sem servidor próprio |
| Acesso de agentes | MCP server Postgres + RPC dedicada + views `agent_*` | Decidido: aceito risco interno, mas com camada segura |
| LLM produção | Claude paga v1 → modelo local depois | Plano explícito de troca |
| Folha v1 | Controle de lançamentos + exportação ao contador | Cálculo CLT fora do escopo |
| Regimes | CLT, PJ, Estagiário | Terceiro fora |
| Design | Friendly/amigável, light-first com dark opcional, emerald accent, Manrope | Ver `DESIGN_SYSTEM.md` |
| Release | Vertical por módulo, fase a fase | Solo dev |

## 2. Escopo

### 2.1 Módulos v1 (PDF G&C)

1. **Admissão** — coleta docs → validação IA → guia exame → envio contábil/SST → conclusão
2. **Recrutamento e Seleção** — pipeline kanban, triagem por IA, banco de talentos
3. **Folha (controle)** — lançamentos mensais, alertas, exportação por regime/CNPJ pro contador
4. **Jornada de Conhecimento** — insígnias, foco primeiros 6 meses, alertas, relatórios 30/60/90

### 2.2 Features herdadas do `meurh` (mantém)

- Gestão de colaboradores (CRUD base)
- Estrutura organizacional (companies, stores, teams, positions)
- Exames ocupacionais
- Férias (CLT obrigatório)
- Contracheques (upload do PDF do contador, não geramos)
- Benefícios (VR, VA, plano de saúde com vigência)
- WhatsApp via Evolution API (a confirmar — ver pendências)

### 2.3 O que sai do `meurh` (PR1-LIMPEZA.md)

- TrialExpiredDialog, PaymentModal, planUtils, lógica de trial
- Landing page comercial, FAQ, schema.org
- `is_master_admin`, limites de plano
- Páginas de signup público, pricing

### 2.4 Diferenciação por regime

| Módulo | CLT | PJ | Estagiário |
|---|---|---|---|
| Admissão | Fluxo completo | Contrato + dados + NF inicial | TCE + supervisor + instituição |
| Documentos | RG, CPF, CTPS, comprovante, foto, exame | RG, CPF, contrato social, CNPJ | RG, CPF, comprovante matrícula, TCE |
| Folha (controle) | Salário + HE + faltas + benefícios | Valor NF mensal | Bolsa + recesso |
| Férias | 30d + 1/3 | N/A | Recesso 30d |
| Jornada | Sim | Sim | Sim |
| Exames | Sim | Não | Sim |

## 3. Modelo de dados

Detalhamento em `docs/adr/0002-multi-cnpj.md` (hierarquia) e nas migrations da Fase 0.

### 3.1 Hierarquia organizacional

```
companies (CNPJs do grupo)
  └─ stores (filiais físicas dentro do mesmo CNPJ)
       └─ teams (áreas/departamentos)
            └─ collaborators
```

`companies` tem `cnpj`, `razao_social`, `is_matriz`, `parent_company_id` (nullable).

### 3.2 Tabelas-chave por módulo

**Core (já existe no `meurh`, com ajustes):** `companies`, `stores`, `teams`, `positions`, `collaborators`, `collaborator_documents`, `audit_log`

**Recrutamento (novas):** `job_openings`, `candidates`, `candidate_applications`, `interview_schedules`, `interview_feedbacks`

**Jornada (novas):** `badges`, `collaborator_badges`, `journey_milestones`

**Folha (novas):** `payroll_periods`, `payroll_entries`, `payroll_alerts`

**Admissão (novas):** `admission_journeys`, `admission_documents`, `admission_events`

**Camada de agentes:** views `agent_*` (read-only, sem PII bruta)

### 3.3 Audit log centralizado

Tabela `audit_log` + triggers em todas tabelas com PII. LGPD obrigatório.

## 4. Roadmap

### Fase 0 — Fundação (2 semanas)

- Limpeza do `meurh` (PR1)
- Schema base ajustado (regime, multi-CNPJ, audit log)
- Auth + roles (`admin_gc`, `gestor`, `colaborador`, `contador`)
- Layout + design system (DESIGN_SYSTEM.md aplicado)
- ADRs versionados

**Entregável:** login + dashboard vazio + cadastro de colaborador funcionando.

### Fase 1 — Jornada de Conhecimento (3 semanas)

PDF prioridade Alta. Módulo mais simples — boa primeira entrega.

- CRUD `badges`
- Atribuição manual com evidência
- Dashboard individual + painel time
- Alertas atraso (cron)
- Snapshot 30/60/90
- Exportação Excel/PDF

### Fase 2 — Admissão (4 semanas)

PDF prioridade Alta — maior volume de horas.

- Workflow `admission_journeys` com state machine
- Formulário público de coleta (link único token)
- Upload de documentos (Storage com RLS)
- Validação IA (Edge Function Claude analisa documento)
- Aprovação manual G&C
- Geração guia de exame
- Notificações email
- Envio empacotado pra contábil/SST
- Timeline auditável

### Fase 3 — Recrutamento e Seleção (4 semanas)

- CRUD `job_openings`
- Pipeline kanban
- Cadastro candidato + upload CV
- Triagem IA (Edge Function)
- Detecção candidato recorrente
- Agendamento entrevista (Google Calendar)
- Feedback estruturado
- Banco de talentos
- Hook aprovação → cria `admission_journey`

### Fase 4 — Folha (controle) (3 semanas)

- Painel mensal com status por colaborador
- Lançamentos por tipo + regime
- Aprovação com lock (estorno, não exclusão)
- Alertas D-5/D-3/D-1
- Checklist auto
- Exportação Excel separada por regime + CNPJ
- Histórico/comparação

### Fase 5 — Agentes IA (3-4 semanas)

- MCP server Postgres com escopo restrito
- Agente Analista (chat embarcado)
- Agente Recruiter (triagem batch + opcional conversa preliminar)
- Logs de uso de IA
- Switch de modelo configurável (Claude → local)

### Fase 6+ — Backlog pós-MVP

- WhatsApp Evolution (se confirmado)
- Holerite digital no portal colaborador
- Solicitação de férias completa com cálculo
- Avaliação de desempenho
- Pulse/clima

**Total estimado v1:** ~19 semanas dev + ~5 meses calendário com overhead.

## 5. Skills e Agentes

Detalhamento completo em `docs/adr/0003-agents.md`.

### 5.1 Agentes do produto (rodam em produção)

| Agente | Função | Acesso | Chat? |
|---|---|---|---|
| Analista G&C | Responde perguntas sobre dados agregados | Views `agent_*` via MCP | Sim |
| Recruiter | Triagem CV, conversa preliminar opcional | RPC dedicada | Parcial |
| Document Validator | OCR + verificação tipo + legibilidade | RPC `validate_document` | Não |
| Coordenador Workflow | Avança jornadas, dispara notificações | Edge Functions | Não |
| Policy Layer | Aprova/bloqueia ações de agente | Camada lógica | Não |

**Regra:** agente nunca escreve dado irreversível sem aprovação humana.

### 5.2 Skills de dev (em `.claude/skills/`)

| Skill | Quando dispara |
|---|---|
| SoftHouse-schema-designer | Modelagem de tabela, RLS, índice, migration |
| SoftHouse-module-scaffold | Novo módulo, nova página |
| SoftHouse-rls-writer | Policies RLS |
| SoftHouse-edge-function-builder | Edge Function nova |
| SoftHouse-shadcn-form | Formulário com validação BR |
| SoftHouse-test-recipe | Testes Vitest + Testing Library |

### 5.3 Agentes de dev

- **PM Solo** — quebra feature em tarefas (migration → policies → service → hook → componente → rota → teste)
- **Code Reviewer Solo** — review automático antes de commit (RLS? Audit? Tipos? Rollback? PII mascarada?)

## 6. Próximos passos

1. ✅ Fork `meurh` → `SoftHouse` no GitHub
2. ✅ Branch `reference/meurh-original` criada
3. [ ] PR1: limpeza do código SaaS (ver `PR1-LIMPEZA.md`)
4. [ ] PR2: novo Supabase corporativo conectado, schema base, ADRs commitados
5. [ ] PR3: ajustes Fase 0 (regime, multi-CNPJ, audit log, roles)
6. [ ] Iniciar Fase 1 (Jornada de Conhecimento)

## 7. Pendências

- [ ] Conta Supabase corporativa criada e em sa-east-1 — **confirmado pelo usuário**
- [ ] Lista de CNPJs do grupo Softcom (matriz + filiais)
- [ ] Domínio interno
- [ ] Provedor de email transacional (Resend ou AWS SES)
- [ ] Política de retenção LGPD por tabela
- [ ] Decisão WhatsApp Evolution: v1 ou backlog
- [ ] Logo SoftHouse (caminho recomendado: wordmark Manrope 800 + ícone emerald simples)
- [ ] SSO ou email/senha + MFA
- [ ] Aprovador final mudanças sensíveis (admin G&C)
