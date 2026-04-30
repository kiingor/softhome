# SoftHouse — API Externa

API REST para integração e migração de dados. Implementada como Supabase Edge Functions.

**Base URL**
```
https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1
```

---

## Autenticação

Todas as requisições precisam de um header de autenticação:

```
x-api-key: <SOFTHOUSE_API_KEY>
```

Alternativamente:
```
Authorization: Bearer <SOFTHOUSE_API_KEY>
```

A chave é configurada como secret no Supabase (`SOFTHOUSE_API_KEY`). Peça ao administrador do sistema.

---

## Como obter IDs

Antes de usar a API, copie os IDs de referência direto da interface do SoftHouse:

| O que precisar | Onde copiar |
|---|---|
| `store_id` (empresa/filial) | **Empresas** → coluna Ações → botão 📋 |
| `position_id` (cargo) | **Cargos** → coluna Ações → botão 📋 |
| `team_id` (setor) | **Setores** → coluna Ações → botão 📋 |
| `company_id` | Opcional — deduzido automaticamente pelo `store_id` |

---

## Endpoints

### POST /api-collaborators — Criar colaborador

```
POST https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/api-collaborators
```

#### Body

```json
{
  "store_id": "uuid",              
  "name": "João da Silva",         
  "cpf": "123.456.789-00",         

  "status": "ativo",               
  "regime": "clt",                 

  "position_id": "uuid",           
  "team_id": "uuid",               
  "contracted_store_id": "uuid",   
  "company_id": "uuid",            

  "email": "joao@softcom.com.br",  
  "phone": "(11) 99999-9999",      
  "admission_date": "2024-03-01",  
  "birth_date": "1990-05-20",      
  "is_temp": false                 
}
```

#### Campos obrigatórios

| Campo | Tipo | Descrição |
|---|---|---|
| `store_id` | uuid | ID da empresa/filial onde o colaborador trabalha |
| `name` | string | Nome completo |
| `cpf` | string | CPF (com ou sem pontuação — normalizado automaticamente) |

#### Campos opcionais

| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `status` | enum | `"ativo"` | Status inicial do colaborador |
| `regime` | enum | `"clt"` | Regime de contratação |
| `position_id` | uuid | null | ID do cargo |
| `team_id` | uuid | null | ID do setor |
| `contracted_store_id` | uuid | null | Empresa contratante (se diferente da executora) |
| `company_id` | uuid | auto | Deduzido do `store_id` automaticamente |
| `email` | string | null | E-mail corporativo |
| `phone` | string | null | Telefone |
| `admission_date` | string | null | Data de admissão (formato `YYYY-MM-DD`) |
| `birth_date` | string | null | Data de nascimento (formato `YYYY-MM-DD`) |
| `is_temp` | boolean | `false` | Colaborador temporário |

#### Valores de `status`

| Valor | Quando usar |
|---|---|
| `"ativo"` | Colaborador já cadastrado / migração de base existente |
| `"aguardando_documentacao"` | Novo contratado que vai passar pelo fluxo de admissão |

#### Valores de `regime`

| Valor | Descrição |
|---|---|
| `"clt"` | Carteira assinada |
| `"pj"` | Pessoa jurídica |
| `"estagiario"` | Estágio |

#### Resposta de sucesso — `201 Created`

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "João da Silva",
    "cpf": "12345678900",
    "status": "ativo",
    "regime": "clt",
    "admission_date": "2024-03-01",
    "created_at": "2026-04-30T14:00:00.000Z"
  }
}
```

#### Exemplo cURL

```bash
curl -X POST \
  https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/api-collaborators \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE_AQUI" \
  -d '{
    "store_id": "ID_DA_EMPRESA",
    "name": "Maria Souza",
    "cpf": "98765432100",
    "status": "ativo",
    "regime": "clt",
    "position_id": "ID_DO_CARGO",
    "team_id": "ID_DO_SETOR",
    "email": "maria@softcom.com.br",
    "admission_date": "2023-06-01"
  }'
```

#### Consultar valores de referência

```bash
curl -X GET \
  https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/api-collaborators \
  -H "x-api-key: SUA_CHAVE_AQUI"
```

Retorna os valores válidos de `status`, `regime` e a lista de empresas com seus IDs.

---

### POST /api-candidates — Criar candidato (banco de talentos)

```
POST https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/api-candidates
```

#### Body

```json
{
  "name": "Ana Lima",
  "email": "ana@email.com",        
  "phone": "(11) 98888-7777",      
  "cpf": "111.222.333-44",         
  "cv_url": "https://...",         
  "linkedin_url": "https://linkedin.com/in/analima",
  "source": "linkedin",            
  "notes": "Indicação do Carlos",  
  "is_active": true,               
  "company_id": "uuid"             
}
```

#### Campos

| Campo | Obrigatório | Padrão | Descrição |
|---|---|---|---|
| `name` | ✅ | — | Nome completo |
| `email` | — | null | E-mail (único por empresa) |
| `phone` | — | null | Telefone |
| `cpf` | — | null | CPF (normalizado automaticamente) |
| `cv_url` | — | null | URL pública do currículo (PDF ou outro) |
| `linkedin_url` | — | null | URL do perfil no LinkedIn |
| `source` | — | `"api_migracao"` | Origem do cadastro |
| `notes` | — | null | Observações livres |
| `is_active` | — | `true` | Ativo no banco de talentos |
| `company_id` | — | auto | Deduzido automaticamente (sistema single-tenant) |

#### Exemplo de `cv_url`

```
https://mxqbawfazgvdnyhrarlz.supabase.co/storage/v1/object/public/curriculos/1756342781777_7hiap4l7te7.pdf
```

Qualquer URL pública é aceita — Supabase Storage, Google Drive (link direto), OneDrive, S3, etc.

#### Resposta de sucesso — `201 Created`

```json
{
  "data": {
    "id": "661e8511-f30c-52e5-b827-557766551111",
    "name": "Ana Lima",
    "email": "ana@email.com",
    "phone": "(11) 98888-7777",
    "cv_url": "https://...",
    "source": "api_migracao",
    "is_active": true,
    "created_at": "2026-04-30T14:00:00.000Z"
  }
}
```

#### Exemplo cURL

```bash
curl -X POST \
  https://mxqbawfazgvdnyhrarlz.supabase.co/functions/v1/api-candidates \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE_AQUI" \
  -d '{
    "name": "Ana Lima",
    "email": "ana@email.com",
    "cv_url": "https://tutkkphsvxwopquiwuue.supabase.co/storage/v1/object/public/curriculos/1756342781777_7hiap4l7te7.pdf",
    "source": "linkedin"
  }'
```

---

## Erros

| Status | Código | Situação |
|---|---|---|
| `400` | — | Campo obrigatório ausente, valor inválido |
| `401` | — | x-api-key ausente ou incorreta |
| `405` | — | Método HTTP não suportado |
| `409` | — | CPF ou e-mail já cadastrado (duplicata) |
| `422` | — | Erro de banco (constraint, FK inválida, etc.) |

#### Formato de erro

```json
{
  "error": "Descrição do erro em pt-BR"
}
```

---

## Configuração da chave de API

No dashboard do Supabase:

1. Acesse **Project Settings → Edge Functions → Secrets**
2. Adicione: `SOFTHOUSE_API_KEY` = `<sua_chave_segura>`
3. Implante as funções:
   ```bash
   npx supabase functions deploy api-collaborators
   npx supabase functions deploy api-candidates
   ```

---

## Notas de migração

- **CPF**: envie com ou sem formatação (`"123.456.789-00"` ou `"12345678900"`) — normalizado para 11 dígitos
- **Datas**: sempre `YYYY-MM-DD` (ex: `"2023-06-15"`)
- **Colaboradores existentes**: use `"status": "ativo"` para cadastros diretos da migração
- **Novos contratos**: use `"status": "aguardando_documentacao"` para iniciar o fluxo de admissão
- **Duplicata de CPF**: a API retorna `409` — use isso para detectar registros já migrados
- **Duplicata de e-mail** (candidatos): mesma lógica, retorna `409`
