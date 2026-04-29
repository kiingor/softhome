# `journey/` — Jornada de Conhecimento

**Fase 1** (3 semanas no plano). Mais simples — boa primeira entrega.

## Escopo

Acompanha o desenvolvimento de cada colaborador via **insígnias** (badges) conquistadas. Foco nos primeiros 6 meses (30/60/90 dias).

## Tabelas

- `badges` — catálogo de insígnias (categoria, peso, descrição, ícone)
- `collaborator_badges` — atribuições (quem ganhou o quê, quando, por quem, evidência opcional)
- `journey_milestones` — alertas e snapshots 30/60/90 dias por colaborador

## Funcionalidades v1

- CRUD de catálogo de badges (admin_gc)
- Atribuição manual de badge a colaborador (gestor + admin)
- Dashboard individual: badges conquistadas, progresso
- Painel time/empresa: distribuição, ranking
- Alertas de atraso 30/60/90 (cron via Edge Function)
- Snapshot mensal exportável (Excel/PDF)

## Não faz parte da v1

- Atribuição automática por regra (futuro)
- Gamificação (pontos, ranking público) — nunca, é antipattern em RH
- Integração com avaliação de desempenho — Fase futura
