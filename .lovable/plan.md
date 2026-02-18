
# Sistema de Notificacoes WhatsApp via EvolutionAPI

## Visao Geral

Integrar a EvolutionAPI para envio automatico de mensagens WhatsApp aos colaboradores em momentos-chave do fluxo. A configuracao ficara em uma nova aba "Notificacoes WhatsApp" nas Configuracoes.

---

## Banco de Dados - Novas Tabelas

### 1. `whatsapp_instances`
Armazena os dados da instancia conectada por empresa.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | PK |
| company_id | uuid | FK companies |
| instance_name | text | Nome unico da instancia |
| instance_id | text | ID retornado pela Evolution |
| status | text | open, close, connecting |
| phone_number | text | Numero conectado |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2. `notification_templates`
Mensagens configuráveis por empresa e evento.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | PK |
| company_id | uuid | FK companies |
| event_type | text | Tipo do evento |
| is_enabled | boolean | Ativa/desativa |
| message_template | text | Texto com variaveis |
| created_at / updated_at | timestamptz | |

### 3. `notification_logs`
Historico de envios.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid | PK |
| company_id | uuid | FK |
| collaborator_id | uuid | FK |
| event_type | text | |
| phone_number | text | Destino |
| message_sent | text | Mensagem final |
| status | text | sent, failed, no_phone |
| error_message | text | Erro se houver |
| created_at | timestamptz | |

---

## Eventos de Notificacao (6 tipos)

### Pre-cadastrados com mensagens alegres:

1. **collaborator_registered** - Ao cadastrar colaborador
   > "Ola {nome}! Bem-vindo(a) a {empresa}! Estamos muito felizes em te ter no time! Para completar seu cadastro, acesse o link abaixo e preencha seus dados: {link_primeiro_acesso} Qualquer duvida, estamos aqui!"

2. **documents_approved** - Cadastro aprovado (status -> ativo)
   > "Parabens {nome}! Seu cadastro foi aprovado com sucesso! Agora voce ja faz parte oficialmente da equipe {empresa}! Acesse o Portal do Colaborador para ver seus dados: {link_portal} Seja muito bem-vindo(a)!"

3. **documents_rejected** - Cadastro reprovado
   > "Ola {nome}, precisamos da sua atencao! Alguns documentos do seu cadastro na {empresa} precisam de ajustes. Acesse o link abaixo para verificar e reenviar: {link_primeiro_acesso} Estamos torcendo por voce!"

4. **exam_created** - Novo exame agendado
   > "Ola {nome}! Um novo exame ocupacional foi agendado pra voce na {empresa}! Tipo: {tipo_exame} Data limite: {data_exame} Fique atento(a) ao prazo! Qualquer duvida, fale com o RH."

5. **vacation_starting** - Ferias iniciando
   > "Ola {nome}! Suas ferias estao chegando! Periodo: {data_inicio} a {data_fim} Aproveite bastante esse descanso merecido! A equipe {empresa} deseja otimas ferias!"

6. **payslip_available** - Novo contracheque disponivel
   > "Ola {nome}! Seu contracheque de {mes}/{ano} ja esta disponivel no Portal do Colaborador! Acesse para conferir: {link_portal} Bom trabalho!"

---

## Edge Functions

### 1. `whatsapp-api` (principal)
Gerencia instancias e envio de mensagens.

Acoes:
- **create_instance**: Cria instancia na EvolutionAPI com webhook configurado
- **connect_instance**: Retorna QR code para conexao
- **check_status**: Verifica status da conexao
- **disconnect_instance**: Desconecta instancia
- **send_notification**: Envia mensagem para um colaborador
- **get_qrcode**: Busca QR code atualizado

Endpoints EvolutionAPI usados:
- `POST /instance/create` - Criar instancia
- `GET /instance/connect/{instance}` - Gerar QR code
- `GET /instance/connectionState/{instance}` - Status
- `DELETE /instance/logout/{instance}` - Desconectar
- `POST /message/sendText/{instance}` - Enviar mensagem

### 2. `whatsapp-webhook`
Recebe eventos da EvolutionAPI (CONNECTION_UPDATE, QRCODE_UPDATED).
Atualiza o status da instancia no banco automaticamente.

---

## Frontend - Nova aba em Configuracoes

### Aba "Notificacoes WhatsApp"

**Secao 1 - Conexao WhatsApp**
- Card com status atual (Conectado/Desconectado)
- Botao "Conectar WhatsApp" -> gera QR code em modal
- QR code com polling automatico ate conectar
- Ao conectar: mostra numero, status verde, botao "Desconectar"

**Secao 2 - Notificacoes**
- Lista de cards para cada evento
- Cada card tem:
  - Switch para ativar/desativar
  - Nome do evento
  - Textarea editavel com a mensagem template
  - Botao salvar alteracoes
- Variaveis disponiveis listadas abaixo do textarea

---

## Disparo Automatico das Notificacoes

Os disparos serao feitos via chamadas a edge function `whatsapp-api` nos pontos do codigo onde os eventos ocorrem:

| Evento | Onde dispara | Arquivo |
|--------|-------------|---------|
| collaborator_registered | Apos insert do colaborador | CollaboratorModal.tsx (handleSave) |
| documents_approved | Ao aprovar cadastro | CollaboratorValidationTab.tsx (handleApproveAll) |
| documents_rejected | Ao reprovar cadastro | CollaboratorValidationTab.tsx (handleRejectAll) |
| exam_created | Apos criar exame | ExamRequestModal.tsx |
| vacation_starting | Via cron ou ao aprovar ferias | VacationRequestModal.tsx |
| payslip_available | Apos upload de contracheque | PayslipUploadZone.tsx |

---

## Seguranca

- API Key da EvolutionAPI armazenada como secret do projeto (EVOLUTION_API_KEY)
- Base URL tambem como secret (EVOLUTION_API_URL)
- RLS nas 3 tabelas novas: somente empresa dona pode acessar
- Webhook valida instancia no banco antes de processar

---

## Arquivos Impactados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/migrations/xxx.sql` | 3 novas tabelas + RLS + templates padrao |
| `supabase/functions/whatsapp-api/index.ts` | Nova edge function principal |
| `supabase/functions/whatsapp-webhook/index.ts` | Nova edge function webhook |
| `supabase/config.toml` | Registrar 2 novas functions |
| `src/pages/dashboard/ConfiguracoesPage.tsx` | Nova aba "Notificacoes WhatsApp" |
| `src/components/whatsapp/WhatsAppConfigTab.tsx` | Novo componente da aba |
| `src/components/whatsapp/QRCodeModal.tsx` | Modal do QR code |
| `src/components/whatsapp/NotificationTemplateCard.tsx` | Card de cada template |
| `src/lib/whatsappNotifications.ts` | Helper para disparar notificacoes |
| `src/components/collaborators/CollaboratorModal.tsx` | Disparo ao cadastrar |
| `src/components/collaborators/CollaboratorValidationTab.tsx` | Disparo ao aprovar/reprovar |
| `src/components/exames/ExamRequestModal.tsx` | Disparo ao criar exame |
| `src/components/contabilidade/PayslipUploadZone.tsx` | Disparo ao upload contracheque |
