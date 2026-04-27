# `recruitment/` — Recrutamento e Seleção

**Fase 3** (4 semanas no plano).

## Escopo

Pipeline kanban de vagas, candidatos, banco de talentos, triagem IA via Claude.

## Tabelas

- `job_openings` — vagas abertas (título, regime, área, status, posição na hierarquia)
- `candidates` — banco de talentos (nome, contato, CV armazenado)
- `candidate_applications` — aplicação candidato↔vaga, fase no kanban, score IA
- `interview_schedules` — agendamentos
- `interview_feedbacks` — feedback estruturado pós-entrevista

## Kanban (fases)

```
inscritos → triagem (IA) → entrevista RH → entrevista gestor →
proposta → admissão (handoff pra módulo admission)
```

## Funcionalidades v1

- CRUD de vagas
- Cadastro de candidato + upload CV (Storage)
- Triagem IA: Edge Function `recruitment-cv-screen` lê CV, compara com requisitos da vaga, devolve score 0-100 + justificativa
- Drag-and-drop kanban
- Agendamento de entrevistas
- Feedback estruturado
- Banco de talentos (candidatos não contratados ficam disponíveis pra outras vagas)

## Edge Functions necessárias

- `recruitment-cv-screen` — Claude analisa CV vs. vaga
- `recruitment-interview-summary` — Claude gera resumo do feedback livre

## Integração com Admission

Quando candidato vira "proposta aceita", cria-se um `admission_journey` automaticamente, candidato vira pendente de virar collaborator.
