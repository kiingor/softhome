# ADR 0005 — Integração com api.softcom.cloud (agenda)

**Data:** 2026-05-18
**Status:** Aceito

## Contexto

A Softcom mantém um sistema legado interno (`api.softcom.cloud`, chamado internamente de "agenda") que é a fonte da verdade pra cadastros corporativos: empresas (CNPJs), setores, cargos e colaboradores. O SoftHouse precisa espelhar esses dados pra não duplicar o cadastro manualmente — divergências entre os dois sistemas viraram dor frequente.

A doc pública da API responde 403 (precisa de credencial). URL base, formato de auth e shape dos endpoints serão fornecidos pelo time interno em momento posterior.

## Decisão

### Estratégia de sync: espelho 100%

- **Insert** registros novos (`external_id` ainda não existe localmente)
- **Update** registros já vinculados (match por `external_id` dentro da mesma `company_id`)
- **Desativar** (`is_active=false` ou `status='inativo'`) registros locais sincronizados que sumiram da API

A sync é manual via botão "Sincronizar" em cada tela (Empresas, Setores, Cargos). Sem cron na primeira fase — operacionalmente mais simples e dá controle ao RH sobre quando atualizar.

**Colaboradores ficam fora desta fase.** Volume bem maior, PII pesado (CPF, RG, salário) e necessidade de match por CPF como fallback exigem trabalho dedicado. O campo `external_id` já fica disponível pra preenchimento manual desde o PR de schema.

### Identificador externo

Coluna `external_id text` em [`stores`, `teams`, `positions`, `collaborators`]. Nome genérico (não `softcom_id` / `agenda_id`) pra deixar porta aberta pra outras fontes no futuro.

Índice único parcial por `(company_id, external_id) WHERE external_id IS NOT NULL` — permite coexistência de registros manuais (sem `external_id`) e sincronizados na mesma tabela, e impede colisão entre sincronizados dentro da mesma empresa.

### Status pra suportar desativação

- `stores`, `teams`, `positions` ganham `is_active boolean NOT NULL DEFAULT true`
- `collaborators` já tem enum `status` ('ativo'|'inativo') e fica como está

Nenhuma tela passa a filtrar por `is_active` no momento da introdução — mudança de UX cabe em PR separado se for desejada.

### Arquitetura: Edge Function como proxy

- 1 Edge Function por entidade (`sync-stores`, `sync-teams`, `sync-positions`)
- Cliente HTTP isolado em [supabase/functions/_shared/softcom-cloud.ts](../../supabase/functions/_shared/softcom-cloud.ts)
- Tipos remotos em [supabase/functions/_shared/softcom-cloud-types.ts](../../supabase/functions/_shared/softcom-cloud-types.ts)

Frontend chama a Edge Function via `supabase.functions.invoke(...)`. Token da API legada nunca sai do servidor.

### Auth / Secrets

```bash
supabase secrets set SOFTCOM_CLOUD_BASE_URL=https://api.softcom.cloud
supabase secrets set SOFTCOM_CLOUD_API_KEY=<ak_...>
```

A API exige header `x-api-key: <chave>` (não Bearer). A chave começa com `ak_`. Base URL sem o `/v1`, que vai nos paths (`/v1/empresas-pdv`, `/v1/setores`, `/v1/cargos`).

### Endpoints usados (confirmados via OpenAPI)

| Entidade local | Endpoint remoto       | Shape principal                              |
|----------------|-----------------------|----------------------------------------------|
| `stores`       | `GET /v1/empresas-pdv`| `{ id, nomes?, cnpj?, logradouro?, ... }`    |
| `teams`        | `GET /v1/setores`     | `{ id, nome }`                                |
| `positions`    | `GET /v1/cargos`      | `{ id, nome, setor?, nivel?, salarioAtual? }`|

Observações importantes:
- IDs vêm como `number` no remoto; gravados como `String(id)` em `external_id text`
- `empresas-pdv` não tem campo "ativo" operacional (`primeAtivo` é flag de plano Prime, não status)
- `cargos.setor` é texto livre, não FK — `positions.team_id` fica null no sync (manual depois)
- Setores e cargos são globais no remoto, sem vínculo a PDV — `teams.store_id` também fica null

### Permissão pra disparar sync

- Cada Edge Function valida o token do usuário, exige `user_belongs_to_company(uid, company_id)` e ou `is_company_admin(uid, company_id)` ou `get_user_permissions(uid, company_id, '<modulo>').can_create`
- Botão no frontend só aparece se `canCreate || isAdmin` (via `usePermissions`)

## Alternativas consideradas

### Webhook (push da API legada)
Rejeitada: a API legada não expõe webhooks; controle manual via botão é mais barato no curto prazo. Pode ser revisitado se a API adicionar suporte.

### Não desativar registros sumidos
Rejeitada: usuário pediu espelho 100%. Hard-delete também rejeitada — colaboradores apontam pra teams/positions via FK e quebraria histórico.

### Cliente HTTP no frontend (sem Edge Function)
Rejeitada: expõe token da API legada no client; CORS adicional. Edge Function é o padrão já estabelecido por [`holidays-sync`](../../supabase/functions/holidays-sync/index.ts).

### Nome do campo `softcom_id` ou `agenda_id`
Rejeitada: `external_id` é agnóstico. Se aparecerem outras integrações no futuro, não precisa migrar o nome.

## Consequências

### Positivas
- Cliente HTTP centralizado: quando a doc real chegar, basta editar 1-2 arquivos
- Botão sync por entidade dá controle granular ao RH
- Audit log captura todas as mudanças decorrentes de sync
- Mesmo padrão de Edge Function que `holidays-sync` — baixa curva pra manter

### Negativas
- Inativar (não deletar) deixa lixo crescendo ao longo do tempo; cleanup pode virar PR futura
- Sync é manual (sem cron) — RH precisa lembrar de clicar
- Sem fila de sync: dois cliques rápidos dão duas chamadas à API; mitigação via `disabled={isSyncing}` no botão

### Riscos
- **Mudança breaking na API legada** quebra o sync. Isolar em `_shared/softcom-cloud.ts` reduz blast radius.
- **Latência da API > 15s** causa timeout. `DEFAULT_TIMEOUT_MS` pode ser aumentado caso ocorra.
- **Resolução de FK na sync de setores/cargos** depende de sync de empresas ter rodado antes (`teams.store_id` resolve via `stores.external_id`). Tooltip no botão deve orientar.

## Revisão

Revisitar quando:
- Doc real da API chegar (preencher TODOs em `softcom-cloud.ts`)
- Volume de syncs justificar cron
- Sync de colaboradores entrar (escopo separado, ADR adicional se necessário)
