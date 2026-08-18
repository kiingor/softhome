# Relatório final de segurança — DNA Softcom
**Base:** 7 auditorias independentes + passada cética (0 achados derrubados) + esta verificação de confirmação.
**Escopo lido:** repositório em `C:\Users\lourenco.filipe\orca\workspaces\SoftHome\gudgeon`, branch `release/vps-homolog`, com prioridade na superfície não commitada (PIX Santander, 2FA de pagamento, gateway mTLS).
**Nada foi executado contra banco, API ou produção. Nenhum arquivo foi alterado.**

---

## 1. Veredito em 5 linhas

1. **Produção (Vercel + `mxqbawfazgvdnyhrarlz`, ~300 pessoas) segue com a Onda 1 aberta** — os 3 buckets de PII, o IDOR do `update-user-password`, o trio `onboarding-*` anônimo com service_role. Isso é o que está sangrando **hoje**, e as migrations que resolvem já foram ensaiadas contra aquele banco (`SEGURANCA.md` §3/§8).
2. **O código novo do PIX não está em produção — e é bom que não esteja.** O congelamento da folha, que o desenho inteiro vende como "a diretoria decidiu quanto e pra quem", é **refazível depois da aprovação por quem tem `financeiro.can_edit`**, e a aprovação da diretoria é **forjável** por quem tem o mesmo módulo. Quatro auditores acharam a primeira por caminhos diferentes; dois acharam a segunda.
3. **A conferência humana que o gateway declara ser o último controle não existe na tela.** O `santander-gw` não manda `beneficiary` ao banco de propósito, delegando ao operador conferir se a chave é da pessoa certa (`santander-gw/santander.ts:636-644`). A tela nunca mostra a chave congelada: mostra a chave **ao vivo** do cadastro antes do código, e joga fora o `payee_pix_key_masked` que o servidor devolve. **Isso é novo — nenhum dos 7 auditores fechou esse laço.**
4. **Pagamento em dobro é alcançável sem má-fé**: dois desafios 2FA vivos para a mesma transferência + zero lock no `handleExecute` + `payroll_pix_mark_sent` que devolve sucesso ao perdedor da corrida = dois PIX reais, **um registro só no Postgres**. Dois pagadores legítimos clicando ao mesmo tempo bastam.
5. **`audit_log` é o espelho de tudo e `gestor_gc` lê inteiro** — anulando, por um canal lateral, as três policies estreitas que as migrations novas escreveram (chave PIX, CPF do favorecido, telefone do 2FA do pagador, existência de pensão alimentícia).

---

## 2. Consolidação por deduplicação

Onde dois ou mais auditores chegaram ao mesmo defeito por caminhos independentes, o sinal é forte. Fundi assim:

| Achado consolidado | Vinha de | Auditores distintos |
|---|---|---|
| **A1** — Snapshot da folha aprovada é refazível (`payroll_build_payable_lines` com `GRANT ... TO authenticated`) | #1, #3, #5, #18 | 4 (PIX, 2FA, RLS, edge functions) |
| **A2** — `closed → aprovado_diretoria` é classificado como `reopen` e escapa da trava de diretoria | #4, #7 (+ reforço em #1, #3, #5) | 2 |
| **A3** — Pagamento em dobro por corrida no `handleExecute` | #2, #15 | 2 |
| **A4** — `audit_log` guarda a linha crua e `gestor_gc` lê tudo | #6, #12 | 2 |
| **M1** — Janela anti-SIM-swap de 60 min sem aviso ao dono | #14, #16 | 2 |
| **M2** — SSRF sem validação em `cv-process` | #20, #32 | 2 |
| **M3** — `whatsapp-api` sem checagem de empresa/papel + telefone em log | #22, #34 | 2 |
| **M4** — `analyst-chat` aceita `sessionId` alheio | #27, #44 | 2 |
| **M5** — `.gitignore` não cobre `.env.*` nem `deploy/*.env` | #29, #42, #47 | 3 |
| **B1** — Oráculo de senha no `payment-2fa-enroll-start` | #25, #39, #40 | 3 |

**Rebaixamentos que eu fiz nesta passada** (o cético já tinha rebaixado #15, #18, #26, #33, #40, #44, #50):

- **B1 (#25/#39/#40) desce de `media` para `baixa`.** O oráculo já existe em aberto: `POST /auth/v1/token?grant_type=password` com a anon key do bundle responde a mesma pergunta para **qualquer anônimo** e ainda devolve sessão. Passar pela edge function é pior para o atacante (todas as tentativas saem do IP do runtime, e cada erro grava `enroll_password_failed` com o `user_id` verificado). O que sobra e é real: **não há lockout por usuário no endpoint que troca o segundo fator**. Corrija, mas não é prioridade.
- **#50 tem o título errado.** "Sem base legal" é falso: `AplicarPage.tsx:364-372` coleta consentimento LGPD explícito e `20260512100000` persiste `consent_lgpd_at`. Sobra minimização (PDF cru com CPF/RG indo à LLM), transferência internacional para `api.openai.com` sem salvaguarda versionada, e o texto do consentimento não mencionar IA de terceiro. Mantido em **baixa**, com o título corrigido.
- **#14/#16: "não existe caminho de revogação" é falso.** A vítima recadastrar o próprio número **revoga** o aparelho do atacante (`payment-2fa-enroll-confirm/index.ts:190-215`). O defeito real e único é ela **não ser avisada** dentro dos 60 minutos.

Nenhum achado foi cortado por não se sustentar. Os 50 sobreviveram, 10 deles fundidos.

---

## 3. Achados por severidade

### ALTA

---

#### A1 — O congelamento da folha aprovada é refazível, e a tela de conferência não consegue denunciar 🆕 NOVO
`supabase/migrations/20260818120100_payroll_payable_lines.sql:294-302, :318-331, :561-570, :590-591`
`src/modules/payroll/components/PaymentsTab.tsx:576` · `src/modules/payroll/components/PixPaymentDialog.tsx:229` · `src/modules/payroll/hooks/use-pix-payment.ts:49`

**Verificado por mim, linha a linha.** A função que congela valor **e destinatário**:

```sql
REVOKE EXECUTE ON FUNCTION public.payroll_build_payable_lines(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.payroll_build_payable_lines(uuid) TO authenticated;   -- :590-591
```

e a única autorização interna aceita `has_module_permission(auth.uid(), v_company, 'financeiro', 'can_edit')` (`:294-302`) — módulo que a tela de Permissões oferece no grupo "Operação" (confirmado no diff de `src/hooks/usePermissions.ts:83`). A trava de status exige exatamente `aprovado_diretoria`, que **é o estado normal da folha na semana do pagamento**. A trava de regeneração (`:318-329`) só morde depois que já existe transferência PIX — ou seja, é inútil antes do primeiro pagamento. E o `DELETE` + `INSERT` relê o cadastro vivo: `c.pix_key, c.pix_key_normalized, c.pix_key_type` (`:561-570`).

**Quem ataca:** analista de RH autenticado com `colaboradores.can_edit` + `financeiro.can_edit`. Não é diretoria, não é `admin_gc`, não tem 2FA.

**Como:**
1. `PATCH /rest/v1/collaborators?id=eq.<vítima>` com `{"pix_key":"<chave do atacante>"}` (passa pela policy de UPDATE e pelo ramo de RH do `trg_collaborators_self_update_guard`; as colunas geradas se recalculam sozinhas).
2. `POST /rest/v1/rpc/payroll_build_payable_lines {"p_period_id":"<folha aprovada>"}`. Passa nos três gates.
3. Devolve a chave original ao cadastro. A linha congelada guarda a do atacante para sempre.
4. A diretoria clica em Pagar; `payroll_pix_open_transfer` copia `payee_pix_key_norm` da linha adulterada e o PIX sai.

**A parte nova, que fecha o caso.** O gateway declara por escrito quem é o controle final:

> `santander-gw/santander.ts:636-644` — *"O `beneficiary` NÃO é enviado, de propósito... quem confere que a chave é da pessoa certa é o operador, na tela de confirmação, antes do código sair."*

Esse operador **não tem como conferir**:
- `PaymentsTab.tsx:576` passa `pixKey={entry.collaborator?.pix_key}` — a chave **ao vivo** do cadastro, não o snapshot. `PixPaymentDialog.tsx:229` exibe essa.
- O servidor **devolve** o snapshot mascarado: `payroll-pix-pay/index.ts:502-505` responde `payee_pix_key_masked`. O front **declara o campo** (`use-pix-payment.ts:49`) e **nunca o renderiza** — a tela do código mostra só `payee_name` e `amount` (`PixPaymentDialog.tsx:296-303`).
- O `payee_document` (CPF) está no snapshot mas **não vai no payload**, então o Santander também não cruza chave × pessoa.

Resultado: em nenhum ponto do fluxo um humano vê a chave que vai receber o dinheiro. O comentário de `20260818120100:154-159` ("o VALOR e o DESTINATÁRIO decididos no instante em que a diretoria aprova") descreve uma garantia que não existe.

**Impacto:** desvio do líquido de qualquer colaborador para conta escolhida por um operador de RH, com 2FA válido, assinatura do pagador legítimo e nada acusando divergência. PIX não tem estorno unilateral.

**Correção — migration nova + 5 linhas de front:**

```sql
-- 1. A RPC não tem chamador legítimo no cliente (grep em src/ só acha o nome
--    em types.ts gerado). O trigger é SECURITY DEFINER e roda como owner.
REVOKE EXECUTE ON FUNCTION public.payroll_build_payable_lines(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.payroll_build_payable_lines(uuid) TO service_role;

-- 2. Dentro do builder, antes do DELETE de :331 — congelar é ato único por aprovação.
IF EXISTS (SELECT 1 FROM public.payroll_payable_lines WHERE period_id = p_period_id) THEN
  RAISE EXCEPTION 'Essa folha já está congelada — devolve pra rascunho e peça nova aprovação da diretoria'
    USING ERRCODE = '22023';
END IF;

-- 3. Tirar 'financeiro.can_edit' do gate de :294-302 e amarrar o papel diretoria à empresa:
--    is_admin_gc(auth.uid())
--    OR (EXISTS (... role = 'diretoria') AND public.user_belongs_to_company(auth.uid(), v_company))
```

E no front (é a mitigação mais barata do repositório inteiro, vale mesmo antes da migration):

```tsx
// PixPaymentDialog.tsx, na tela do código — mostrar o que o SERVIDOR vai pagar,
// não o que o cadastro diz agora:
<p className="mono text-xs text-muted-foreground">{desafio.payee_pix_key_masked}</p>
```

e trocar `pixKey={entry.collaborator?.pix_key}` por um aviso de que a chave definitiva aparece na confirmação — a tela de antes do código não deve exibir dado que não é o que vai ser pago.

> **Incerteza mantida:** não consegui conferir em produção quantos usuários reais têm `financeiro.can_edit` **e** `colaboradores.can_edit` sem papel de diretoria. Se hoje esse conjunto for vazio, o achado é latente — mas é exatamente a combinação que a tela de Permissões oferece.

---

#### A2 — RH com `financeiro.can_edit` fabrica a aprovação da diretoria pelo `reopen` 🆕 NOVO
`supabase/migrations/20260727120100_payroll_period_approval_flow.sql:163-164, :222-230, :635-640`

**Verificado por mim.** A máquina de estados:

```sql
WHEN p_from IN ('open','aprovado_rh') AND p_to = 'closed'                              THEN 'close'
WHEN p_from = 'closed' AND p_to IN ('open','aprovado_rh','aprovado_diretoria')         THEN 'reopen'
```

O guard só exige diretoria em três pontos, e `reopen` não está em nenhum:

```sql
IF v_action IN ('approve_diretoria', 'return_to_rh') AND NOT v_is_dir THEN ...
IF v_action = 'return_to_draft' AND OLD.status = 'aprovado_diretoria' AND NOT v_is_dir THEN ...
IF NOT (v_can_rh OR v_is_dir) THEN ...     -- v_can_rh = is_admin_gc OR financeiro.can_edit
```

A policy de escrita é `FOR ALL` para `gestor_gc/rh/diretoria` (`:635-640`), e o front já faz PATCH direto (`use-payroll.ts:2080`, `:2104`).

**Quem ataca:** `gestor_gc`/`rh` com `financeiro.can_edit` — o perfil normal de quem monta a folha.

**Como:** dois PATCH no console do navegador.
```js
await supabase.from('payroll_periods').update({status:'closed'}).eq('id', PERIOD_ID)              // 'close'  → passa
await supabase.from('payroll_periods').update({status:'aprovado_diretoria'}).eq('id', PERIOD_ID)  // 'reopen' → passa
```
O `AFTER UPDATE trg_payroll_period_freeze_payable_lines` dispara e congela a folha com os valores e destinatários que ele escolheu. `payroll_pix_open_transfer` aceita `status IN ('aprovado_diretoria','closed','exported')` e **não olha `approved_dir_by`**, que fica NULL (o CASE de `:248-255` cai no `ELSE OLD`).

**Impacto:** colapsa a segregação de alçadas. Quem digita os valores passa a "aprovar" a própria folha, e o executor vê uma folha marcada como aprovada pela diretoria. Também contorna a correção A1 acima — sem consertar isto, revogar a RPC não adianta, porque o trigger reexecuta o builder.

**Correção — mesma migration nova:**

```sql
-- máquina de estados: reabrir cai pra trás, nunca pra 'aprovado_diretoria'
WHEN p_from = 'closed' AND p_to IN ('open','aprovado_rh') THEN 'reopen'

-- guard: trave por DESTINO, não por nome de ação
IF NEW.status = 'aprovado_diretoria'
   AND OLD.status IS DISTINCT FROM 'aprovado_diretoria'
   AND NOT v_is_dir THEN
  RAISE EXCEPTION 'Só a diretoria coloca a folha em aprovado_diretoria';
END IF;

-- e em payroll_pix_open_transfer (20260818120200:434-441), exigir o carimbo:
--   AND p.approved_dir_by IS NOT NULL
-- status forjado sem carimbo deixa de servir de portão.
```

---

#### A3 — Pagamento em dobro: dois códigos vivos + zero lock no `handleExecute` 🆕 NOVO
`supabase/functions/payroll-pix-pay/index.ts:87, :351-372, :595-606, :795-828`
`supabase/migrations/20260818120200_payroll_pix_transfers.sql:547-575`

**Verificado por mim, no caminho inteiro.**

- `MAX_CHALLENGES_PER_TRANSFER = 5` e nada invalida os desafios anteriores ao criar o novo (`:351-372`).
- O `handleExecute` lê o status com um `SELECT` solto e decide sem lock, sem `FOR UPDATE`, sem advisory lock (o `pg_advisory_xact_lock` está só dentro de `payroll_pix_open_transfer`, que é o caminho do *challenge*).
- `payment_2fa_consume_challenge` serializa **por linha de desafio** — dois desafios distintos são duas linhas, os dois passam.
- O ponto exato onde a corrida some do registro:

```sql
UPDATE ... SET status='sent' ... WHERE id = p_id AND status = 'created' RETURNING * INTO v;
IF FOUND THEN RETURN v; END IF;
SELECT * INTO v FROM public.payroll_pix_transfers WHERE id = p_id;
IF v.status = 'sent' THEN RETURN v; END IF;   -- ← devolve SUCESSO ao perdedor
```

O perdedor recebe `sentErr = null`, **não desvia para o `markUnknown`**, e segue para o `PATCH .../confirm` usando o `providerPaymentId` do próprio POST dele. É no PATCH que o dinheiro anda.

**Quem ataca:** o pagador legítimo (`admin_gc`/`diretoria` com 2FA). Mas **não precisa de má-fé**: dois pagadores diferentes clicando em "Pagar" na mesma linha ao mesmo tempo têm cada um seu desafio, seu aparelho e seu `user_id`, e caem na mesma corrida. Numa folha de 300 pessoas isso não é laboratório.

**Impacto:** dois PIX do mesmo valor, uma linha só em `payroll_pix_transfers`, uma linha só em `payroll_payments`, um `end_to_end_id` só no audit. O segundo pagamento **só existe no extrato do Santander**. Derruba as duas invariantes escritas no cabeçalho da migration.

**A segunda metade do mesmo problema (era #13, `media`):** o `idempotency_key` **não é chave de idempotência**. `santander-gw/main.ts:386-397` só valida formato; `santander.ts:611-618` a coloca em `tags: [...]` e no `remittanceInformation`. Não há cache, tabela, nem GET-antes-do-POST. E `20260818120200:119-123` e o `COMMENT ON COLUMN` de `:195-196` afirmam o contrário — **um comentário mentiroso sobre dinheiro autoriza o próximo dev a reenviar um POST depois de um timeout**.

**Correção — em três peças:**

```sql
-- 1. Claim atômico ANTES de falar com o gateway (migration nova).
CREATE OR REPLACE FUNCTION public.payroll_pix_claim_for_send(p_id uuid)
RETURNS public.payroll_pix_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.payroll_pix_transfers%ROWTYPE;
BEGIN
  UPDATE public.payroll_pix_transfers
     SET status = 'sending', sent_at = coalesce(sent_at, now())
   WHERE id = p_id AND status = 'created'
  RETURNING * INTO v;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Essa transferência já está sendo enviada' USING ERRCODE = '22023';
  END IF;
  RETURN v;
END; $$;
-- acrescentar 'sending' ao enum pix_transfer_status e ao predicado do índice
-- payroll_pix_transfers_one_in_flight.
```

```ts
// 2. payroll-pix-pay/index.ts, ao emitir novo desafio (~linha 399): um código por vez.
await sbAdmin.from('payment_2fa_challenges')
  .update({ expires_at: new Date().toISOString() })
  .eq('transfer_id', transfer.id).eq('purpose','payment').is('consumed_at', null);
```

3. No `santander-gw/main.ts:handleCreate`, antes do `createPayment`: consultar `searchByIdempotencyKey(key)` (a função já existe, `santander.ts:829`) e devolver o pagamento existente em vez de criar outro; se a busca falhar, responder `provider_unavailable` (`indeterminate: true`) em vez de criar às cegas. E **corrigir os dois comentários** de `20260818120200:119-123` e `:195-196`.

> **Divergência registrada:** um auditor classificou isto como `media` (não há escalonamento de privilégio; cada PIX foi autorizado por um código legítimo). Mantenho `alta` porque o dano é dinheiro irreversível **sem registro no Postgres** e o gatilho acidental é trivial. Se o Santander deduplicar por `tags` — hipótese que nada no repo sustenta e que a ADR 0006 contradiz — o impacto cai para "registro inconsistente".

---

#### A4 — `audit_log` guarda a linha crua e `gestor_gc` lê tudo, anulando as policies novas de pagamento 🆕 NOVO
`supabase/migrations/20260427130200_create_audit_log.sql:102-112` · `20260625160000_audit_recalc_summary.sql:48/53/59`

**Verificado por mim.** O trigger vigente grava `to_jsonb(NEW)` / `to_jsonb(OLD)` sem allowlist de coluna (o único skip é para encargos derivados de `payroll_entries`). A policy de leitura pede apenas papel + empresa:

```sql
CREATE POLICY "gestor_gc reads own company audit" ON public.audit_log FOR SELECT
USING (company_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.role::text IN ('gestor_gc','rh'))
  AND public.user_belongs_to_company(audit_log.company_id, auth.uid()));
```

Os argumentos invertidos **não salvam**: `20260616120000:26-35` tornou a função tolerante à ordem de propósito. Nenhuma migration posterior redefine a policy nem o trigger (conferi por grep).

E as três migrations de 18/08 anexam `audit_log_trigger` exatamente às tabelas cujas policies elas escreveram para excluir esse papel:

| Tabela | Policy escrita (o que ela nega) | Trigger de audit |
|---|---|---|
| `payment_2fa_devices` | `:232-241` — *"Note quem NÃO entra: rh e gestor_gc"* | `20260818120300:129` |
| `payroll_pix_transfers` | `:898-912` — chave PIX, CPF e valor líquido | `20260818120200:249` |
| `payroll_payable_lines` | `:644-660` — *"`has_alimony_block` revela a EXISTÊNCIA de ordem judicial"* | `20260818120100:231` |
| `collaborator_alimony_orders` | `20260512101000:60-68` | `:53-55` |

**Quem ataca:** `gestor_gc` autenticado, com `profile.company_id` da empresa. Sem nenhuma permissão de módulo marcada.

**Como:** a mesma requisição que `src/modules/audit/hooks/use-audit-log.ts:59` já faz, trocando o filtro:
```
GET /rest/v1/audit_log?company_id=eq.<empresa>&table_name=eq.payment_2fa_devices&select=after
```
→ `phone` completo do celular de 2FA de todo pagador. Trocando `table_name`: chave PIX + CPF + valor de toda transferência, `net_amount` + `has_alimony_block` de cada colaborador, dados do beneficiário da pensão, `current_salary`/`cpf`/`rg`/`pix_key` de `collaborators`, `phone_number` + `message_sent` de todo WhatsApp.

**Impacto:** o telefone do 2FA vazando para o RH é o primeiro passo do SIM swap que a coluna `active_from` foi criada para conter. A decisão de produto escrita em três migrations diferentes não vale nada enquanto o `audit_log` estiver assim. E fere o princípio 1 do CLAUDE.md — PII em texto plano em log.

**Correção — migration nova, duas camadas + backfill:**

```sql
-- 1. Não logar a coluna sensível (dentro de public.audit_log_trigger, antes do INSERT):
IF TG_TABLE_NAME = 'payment_2fa_devices' THEN
  v_before := v_before - 'phone';  v_after := v_after - 'phone';
ELSIF TG_TABLE_NAME IN ('payroll_pix_transfers','payroll_payable_lines') THEN
  v_before := v_before - 'payee_pix_key' - 'payee_pix_key_norm' - 'payee_document'
                       - 'request_payload' - 'response_payload';
  v_after  := v_after  - 'payee_pix_key' - 'payee_pix_key_norm' - 'payee_document'
                       - 'request_payload' - 'response_payload';
ELSIF TG_TABLE_NAME = 'collaborator_alimony_orders' THEN
  v_before := v_before - 'beneficiary_cpf' - 'beneficiary_bank_info';
  v_after  := v_after  - 'beneficiary_cpf' - 'beneficiary_bank_info';
END IF;

-- 2. Estreitar a leitura por tabela:
DROP POLICY IF EXISTS "gestor_gc reads own company audit" ON public.audit_log;
CREATE POLICY "gestor_gc reads own company audit" ON public.audit_log FOR SELECT
USING (company_id IS NOT NULL
  AND audit_log.table_name NOT IN (
    'payment_2fa_devices','payment_2fa_events','payroll_pix_transfers',
    'payroll_payable_lines','payroll_entries','payroll_payments',
    'collaborator_alimony_orders','collaborator_medical_certificates',
    'notification_logs','payslips')
  AND EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.role::text IN ('gestor_gc','rh'))
  AND public.user_belongs_to_company(auth.uid(), audit_log.company_id));

-- 3. O histórico já gravado continua legível — limpe:
UPDATE public.audit_log SET after = after - 'phone', before = before - 'phone'
 WHERE table_name = 'payment_2fa_devices';
```

E trocar o `.select("*")` de `use-audit-log.ts:59` por lista explícita de colunas.

> **Precisão:** para o papel `rh`, `payroll_pix_transfers` e `collaborator_alimony_orders` não são escalonamento (as policies próprias já o incluem). O que é escalonamento **para os dois papéis** é `payment_2fa_devices.phone`; para `gestor_gc` é tudo.

---

#### A5 — `update-user-password`: a anti-escalada esqueceu do papel `diretoria` 🆕 NOVO (correção incompleta da Onda 1)
`supabase/functions/update-user-password/index.ts:113-125, :185-200`

**Verificado por mim.** A delegação por módulo é aceita:
```ts
.eq("module", "permissoes").maybeSingle();
if (permCheck?.can_edit) { allowed = true; reason = "permissoes.can_edit"; }
```
e a anti-escalada usa lista literal:
```ts
const targetIsAdmin = (targetRoles ?? []).some((r) =>
  ["admin", "admin_gc"].includes(String((r as { role: unknown }).role)));
```
`'diretoria'` não está lá — e `checkPaymentGate` (`payroll-pix-pay/index.ts:952-955`) aceita `["admin_gc","admin","diretoria"]`. O papel `diretoria` nasceu em `20260727120000`, **depois** da Onda 1; a lista nunca foi atualizada.

**Quem ataca:** usuário com `permissoes.can_edit` na empresa — delegação que a UI apresenta como "gerenciar permissões".

**Como:** `POST /functions/v1/update-user-password {user_id:'<diretor>', company_id:'<sua empresa>', new_password:'...'}` → passa nos três gates → login como o diretor → `payment-2fa-enroll-start` com o celular dele e a senha nova (a reautenticação valida contra a senha recém-gravada) → confirma o código no próprio WhatsApp → 60 min depois executa PIX.

**Correção:**
```ts
const PROTECTED_ROLES = ["admin", "admin_gc", "diretoria"];
const targetIsPrivileged = (targetRoles ?? []).some(
  (r) => PROTECTED_ROLES.includes(String((r as { role: unknown }).role)));
if (targetIsPrivileged && !callerIsAdmin && reason !== "owner") { /* 403 */ }
```
Melhor ainda: uma constante única compartilhada, para o próximo papel privilegiado não repetir o erro. Sobe por `npm run deploy:fn update-user-password`.

> **Incerteza mantida:** se o diretor alvo não tiver `folha_pagamento_exec.can_create` nem for `is_company_admin`, a cadeia para no gate do 2FA — mas o takeover da conta de quem aprova a folha continua.

---

#### A6 — `onboarding-lookup` / `-action` / `-upload`: anônimos, com service_role 📋 BACKLOG (`SEGURANCA.md` §6, ainda aberto)
`supabase/config.toml:18-27` · `onboarding-lookup/index.ts:15-37, :95-135` · `onboarding-action/index.ts:79-104` · `onboarding-upload/index.ts:34-45`

**Confirmei que os três blocos `verify_jwt = false` continuam no `config.toml`** e que nenhuma migration posterior fechou nada.

- **Lookup:** `{"cpf":"..."}` de um anônimo devolve nome, e-mail, telefone, cargo, CNPJ, caminhos de documento, `payroll_entries` **com valores** e benefícios. E cria uma `onboarding_sessions` a cada chamada, sem limite — devolvendo o objeto inteiro, o que entrega o `company_id` ao anônimo (insumo do A9).
- **Action:** `{"action":"complete","collaborator_id":"<uuid>","session_id":"<qualquer uuid válido>"}` muda o status de **qualquer** colaborador. Verifiquei o único freio possível: o `UPDATE` anterior em `onboarding_sessions .eq("id", session_id)` casa 0 linhas com um uuid inexistente e **não retorna erro** — o fluxo segue para o update de `collaborators`.
- **Upload:** `filePath = ${companyId}/${collaboratorId}/${positionDocumentId}.${fileExt}` montado com três strings cruas do formData, extensão tirada de `file.name`, `upsert: true`, **sem MIME allowlist e sem limite de bytes** — e o upload acontece **antes** do INSERT, então mesmo que a FK derrube a linha, o arquivo já está no bucket. Isso **contorna** a correção `20260814100000` da Onda 1, porque service_role ignora policy de storage. Compare com `admission-public-submit`, que faz certo (valida token, deriva o caminho do journey, aplica `ALLOWED_MIMES`/`MAX_BYTES`).

**Correção:** a opção A da própria §6. Rode a contagem, e dando 0, apague rota + link no `PortalLogin` + os 3 blocos do `config.toml` + as functions — **e em produção**, porque `deploy --all` não remove function excluída do repo:
```bash
npx supabase functions delete onboarding-lookup --project-ref mxqbawfazgvdnyhrarlz
npx supabase functions delete onboarding-action --project-ref mxqbawfazgvdnyhrarlz
npx supabase functions delete onboarding-upload --project-ref mxqbawfazgvdnyhrarlz
npx supabase functions delete asaas            --project-ref mxqbawfazgvdnyhrarlz  # está no config.toml e nem existe no repo
```

---

#### A7 — `collaborator-subresource`: `localId` do corpo não é amarrado ao colaborador 📋 BACKLOG (`SEGURANCA.md` §5)
`supabase/functions/collaborator-subresource/index.ts:364-375, :443, :463, :485`

**Verificado por mim por grep:** os três caminhos de escrita filtram só por `id`.
```
444:  await sbAdmin.from(cfg.table).update(data).eq("id", localId!);
464:  await sbAdmin.from(cfg.table).update(data).eq("id", localId!);
485:  await sbAdmin.from(cfg.table).delete().eq("id", localId!);
```
Nenhum `.eq("collaborator_id", ...)` nem `.eq("company_id", ...)`. A permissão é resolvida contra a empresa do `collaboratorId` que **o cliente escolheu** (`:364-375`).

**Quem ataca:** `gestor_gc` de uma filial com `colaboradores.can_edit/can_delete`. Escolhe `collaboratorId` da própria empresa (para o `checkPermission` passar) e `localId` de uma linha da matriz. Com o kill-switch da agenda ligado (`syncOff`), o `data` é gravado cru — o conjunto de colunas alteráveis é a tabela inteira, incluindo `value_paid` em `bonus_entries`.

**Correção:**
```ts
const { data: owner } = await sbAdmin.from(cfg.table)
  .select("id, collaborator_id, company_id").eq("id", localId!).single();
if (!owner || owner.collaborator_id !== collab.id || owner.company_id !== collab.company_id) {
  return jsonResponse({ error: "Registro não pertence a esse colaborador" }, 403);
}
```
mais `.eq("collaborator_id", collab.id)` nos próprios update/delete, e allowlist de colunas por `kind` em vez de repassar `data` inteiro.

---

### MÉDIA

| # | Achado | Arquivo:linha | Quem ataca / como | Correção |
|---|---|---|---|---|
| **M1** 🆕 | **Janela anti-SIM-swap de 60 min não avisa ninguém.** O aparelho antigo é revogado em silêncio; o único "aviso" é uma linha em `payment_2fa_events` que nada observa. O comentário diz que os 60 min existem para "o dono legítimo receber o aviso". | `payment-2fa-enroll-confirm/index.ts:36-39, :206-250` | Quem obteve a **senha** de um pagador troca o aparelho e paga 1h depois; a vítima não recebe SMS, e-mail nem in-app | Antes de revogar o `previous` (`:206`), buscar `phone` do aparelho antigo e mandar WhatsApp pelo mesmo `fetch` de `enroll-start:403-410`. Sem essa mensagem a janela não tem para quem avisar. *(Correção: existe kill switch — a vítima recadastrar o próprio número revoga o do atacante. O que falta é ela **saber**.)* |
| **M2** 🆕 | **`cv-process`: `?ping=claude` antes da auth + SSRF sem validação de destino.** O branch GET está em `:79-112`; a primeira menção a `Authorization` é `:121`. A resposta devolve `ANTHROPIC_BASE_URL`. O `fetch(cvUrl)` de `:253` não valida esquema, host nem faixa privada. | `supabase/functions/cv-process/index.ts:79-112, :253-263` | (A) Anônimo com a anon key queima crédito de IA em laço e descobre o host do iarouter. (B) `gestor_gc` manda `cvUrl: "http://santander-gw:8080/health"` e usa o `trace` (`HTTP <n>` vs erro de conexão vs timeout) como scanner da rede interna | Mover o `?ping` para depois da auth e restringir a `admin_gc` (ou apagar — é diagnóstico). Nunca devolver `ANTHROPIC_BASE_URL`. Validar `cvUrl`: exigir `https:`, recusar loopback/privado/link-local e **hosts sem ponto** (é assim que `santander-gw`, `kong`, `supabase-db` resolvem no Docker). Parar de devolver o `trace` de rede |
| **M3** | **`whatsapp-api` sem checagem de empresa nem papel + telefone completo em log e ecoado ao chamador.** `getUser()` é a única checagem; `company_id` vem do corpo. `console.log(\`Sending WhatsApp to ${phone}...\`)` e `data: sendResult` na resposta | `supabase/functions/whatsapp-api/index.ts:59-75, :217-219, :319, :334, :346-349` | Qualquer autenticado, **inclusive papel `colaborador`**: `{"action":"delete_instance","company_id":"<qualquer>"}` apaga a instância → `payroll-pix-pay:376-391` e `enroll-start:216-239` exigem `status='open'` → **a folha inteira fica sem 2FA** | Antes do `switch`: exigir `user_belongs_to_company(user.id, company_id)` e, para as ações administrativas, `is_company_admin` ou `configuracoes.can_edit`. Em `send_notification`, exigir que o colaborador seja da mesma empresa. Trocar o log por `to=****${phone.slice(-4)}` e parar de devolver `sendResult`. Parar de selecionar `email, cpf` (não são usados). *(Autz é §5 do doc; o acoplamento com o 2FA e o log do telefone são novos.)* |
| **M4** 🆕 | **`analyst-chat` aceita `sessionId` do corpo e opera nele com service_role.** Sem SELECT de conferência; histórico lido e mensagens gravadas na sessão alheia | `supabase/functions/analyst-chat/index.ts:165, :203-230, :322-342` | `gestor_gc`/`rh` lista `agent_sessions` pela policy, escolhe a sessão de um `admin_gc` e grava mensagens nela — capacidade que a migration nega de propósito (`20260429160000:167-168`: *"INSERT messages: SOMENTE service_role"*). Injeção de prompt persistente, porque o histórico volta ao contexto | `if (sessionId) { conferir user_id + company_id + agent_kind → 404 }`. *(A **leitura** na mesma empresa já é permitida por policy; o delta real é a **escrita** e o caso cross-empresa.)* Verificar o mesmo padrão em `recruiter-search` |
| **M5** 🆕 | **`.gitignore` protege o certificado do Santander mas não o env que guarda o `client_secret` e o `GW_SHARED_SECRET`.** Reproduzi: `git check-ignore` responde só por `.env`. `deploy/santander-gw.env`, `deploy/frontend.env` e `.env.bak-cloud` são **NOT-IGNORED** | `.gitignore:15-18` vs `:42-51` · `santander-gw/README.md:37` | O README manda criar `deploy/santander-gw.env` **dentro da árvore do repo**. Um `git add -A` põe no histórico o segredo que o próprio compose chama de *"a única barreira que sobra depois da rede"*. Não há hook, husky, gitleaks nem CI — conferi | `deploy/*.env` + `*.env` + `.env.*` + `!.env.example` no `.gitignore`, e mover `.env.bak-cloud` para fora da árvore. **Hoje não há segredo vazado** (o backup só tem anon key); é exposição latente com raio de explosão de pagamento |
| **M6** 🆕 | **`collaborator_documents`: qualquer autenticado da empresa lista os metadados de documentos de todos os colegas.** O primeiro ramo do OR é só `user_belongs_to_company` | `20260211001857_...sql:108-111` | Papel `colaborador`: `GET /rest/v1/collaborator_documents?select=collaborator_id,file_name,status,rejection_reason` → quem entregou o quê e as anotações do RH ("CPF ilegível") | Trocar por `can_view_module(auth.uid(), company_id, 'colaboradores') OR is_admin_gc(...) OR <é o próprio titular>`. *(A Onda 1 corrigiu o **bucket**, não a tabela de metadados. Em produção, onde o bucket segue aberto, isto vira leitura dos documentos.)* |
| **M7** 🆕 | **`delete-collaborator` exige só o **papel** `gestor_gc` e ignora `colaboradores.can_delete`.** Apaga `user_roles`, `profiles`, `company_users`, chama `auth.admin.deleteUser` e a linha de `collaborators`. Sem nenhum registro em `audit_log` | `supabase/functions/delete-collaborator/index.ts:47-64, :107-138` | `gestor_gc` com `can_delete` **desmarcada** apaga a conta de login do diretor da mesma empresa. Compare com `collaborator-subresource:376-377`, que no mesmo módulo resolve `can_delete` — a checagem foi esquecida, não dispensada | Somar `checkPermission(..., "colaboradores", "can_delete")`; recusar alvo com papel privilegiado; gravar em `audit_log` **antes** de apagar |
| **M8** 🆕 | **`bonus-notify` roda com service_role e não tem checagem de autorização nenhuma.** Sem header `Authorization`, sem `getUser()`, sem papel, sem empresa | `supabase/functions/bonus-notify/index.ts:62-140` | Usuário com papel `colaborador` (e provavelmente anônimo com a anon key) grava notificação falsa em `collaborator_notifications`, dispara WhatsApp pela instância oficial e e-mail com a marca da Softcom dizendo que o 13º caiu. Também é oráculo de existência (404 vs 200) | Ler `Authorization` + `getUser()`, aceitar `Bearer <SERVICE_ROLE_KEY>` como chamada de sistema (padrão de `journey-snapshot:162`), exigir papel de RH + `user_belongs_to_company(collab.company_id)`, e ler `amount`/`year` do banco em vez do corpo |
| **M9** 🆕 | **Atestado médico (CID — art. 11) é legível por `gestor_gc` de qualquer CNPJ do grupo.** A tabela tem `company_id NOT NULL` e índice, e a policy não o usa. `storage_is_rh()` repete o defeito em `medical-certificates`, `admission-docs` e `candidate-cvs` | `20260512100500:41-53` · `20260814100500:25-38, :46, :59, :76-86` | `gestor_gc` de uma filial: `GET /rest/v1/collaborator_medical_certificates?select=cid_code,doctor_name,notes,document_url` sem filtro devolve os atestados de todos os CNPJs. `user_roles` não tem `company_id`, então o papel é global e não recorta nada | Copiar o padrão que a própria Onda 1 provou: `20260814100000:39-62` define `storage_is_company_staff`, que exige `user_belongs_to_company`, e `:198-208` o aplica em `exam-documents` com o comentário certo sobre art. 11. Aplicar aqui. Se o produto decidir que `gestor_gc` não deve ver CID de ninguém, tirar o papel das duas listas |
| **M10** 🆕 | **`payroll_build_payable_lines` também é alcançável via `collaborator-update`** — `pix_key` está na allowlist das seções `identificacao`/`funcionais` e a function grava com service_role, então o `trg_collaborators_self_update_guard` nem entra em cena | `supabase/functions/collaborator-update/index.ts:158, :165, :324-343` | Mesmo ator do A1, por outro caminho de escrita | Coberto pela correção do A1; vale conferir a allowlist de `pix_key` — quem pode editar cadastro não deveria mudar destino de dinheiro sem trilha própria |
| **M11** | **Rotas de Recrutamento, Admissões, Jornada e Agentes sem `PermissionGuard`.** `App.tsx:105-122` monta as páginas cruas; `menu.ts:43-52` declara os módulos e `DashboardSidebar.tsx:102` filtra — o gate só existe na sidebar | `src/App.tsx:105-122` | `rh`/`gestor_gc` com "Banco de Talentos" desmarcado digita `/dashboard/candidatos` e vê a base inteira. **A UI mente**: o item some do menu e a URL funciona | Envolver cada rota no guard que já existe (padrão de `PeriodDetailPage.tsx:1755`). Isso **não é fronteira de segurança** — o dado só fecha de verdade com M12 |
| **M12** | **Módulos `folha`, `decimo_terceiro`, `candidatos`, `vagas`, `admissoes`, `jornada` não existem como controle no banco** 📋 BACKLOG §5. Grep por `can_view_module` nas migrations: 12 ocorrências, nenhuma cita esses seis | `20260427150100:174-199` · `20260427150000:149-173` | Não é só "revogar não revoga": `has_module_permission` é deny-by-default, então qualquer `rh`/`gestor_gc` que **nunca recebeu** `candidatos` já lê a base | Trocar as policies role-only por `can_view_module(auth.uid(), company_id, '<modulo>')` nas 5 tabelas de recrutamento, `admission_*` e jornada. Padronizar `folha` × `financeiro`, e apagar de `MODULE_GROUPS` o que não tiver contraparte no banco |
| **M13** | **`whatsapp-webhook` sem assinatura e logando o corpo inteiro** 📋 BACKLOG §5 + agravante novo | `supabase/functions/whatsapp-webhook/index.ts:15-20, :45-71` | Anônimo manda `{"instance":"meurh_<16hex>","data":{"state":"close"}}` → a instância vira `close`, e `payroll-pix-pay:376-381` / `enroll-start:216-221` **param de funcionar**. O `company_id` que gera o `instance_name` sai do próprio `onboarding-lookup` | `WHATSAPP_WEBHOOK_SECRET` comparado em tempo constante, como `payroll-pix-reconcile:106-110` já faz. Log estruturado só com `instance`/`event`/`state`. Não aceitar `state` como verdade — confirmar via `instance/connectionState` |
| **M14** | **`public_url_origin` do cliente em 3 functions** 📋 BACKLOG §5. Só `send-invite-email:132` foi corrigida | `admission-send-token:83, :152` · `admission-send-whatsapp:97, :187` · `application-test-notify:170` | `gestor_gc`/`rh` manda `public_url_origin` do domínio dele; o e-mail sai do remetente legítimo, com o `access_token` real no path | `Deno.env.get("PUBLIC_APP_ORIGIN")` + 500 se faltar, ignorando o corpo — mesmo padrão já aplicado |
| **M15** 🆕 | **Candidato que pediu saída continua sendo devolvido pela busca por IA.** `is_active` é **selecionado e nunca usado**; `match_candidates` não faz JOIN com `candidates` | `recruiter-search/index.ts:262` · `20260429140000:94-107` | Não é ataque: é o opt-out do titular sendo decorativo. Nome + `cv_summary` de quem pediu para sair voltam ao prompt da LLM a cada busca | `.eq("is_active", true)` na linha 262 (5 minutos) + `JOIN public.candidates c ON c.id = ce.candidate_id AND c.is_active` no `match_candidates` (defesa no banco). O expurgo de verdade continua no backlog §5 |
| **M16** | **Nenhuma rotina de expurgo, e o `audit_log` mantém cópia integral e permanente do PII — inclusive do que já foi excluído.** Reproduzi a busca: os dois únicos cron do sistema são de processamento, nenhum de DELETE; não há policy de DELETE em `audit_log` para ninguém | `20260427130200` (tabela) · `20260625160000:48/53/59` (trigger) | Pedido de eliminação (art. 18 VI): `delete-collaborator` apaga a linha, o trigger `AFTER DELETE` já gravou `before = to_jsonb(OLD)` com CPF, RG, `pix_key` e `current_salary` | Tabela `audit_retention_policy` + `audit_log_purge()` SECURITY DEFINER (revogada de `anon`/`authenticated`) agendada por `pg_cron`, no padrão de `docs/setup-cron-pix-reconcile.sql`. *(A pendência genérica está no CLAUDE.md; o mecanismo e a ausência total de mitigação são novos.)* |
| **M17** 🆕 | **Exportação em massa de folha, exames e auditoria não deixa rastro.** É 100% cliente: `XLSX.writeFile` local, nenhuma chamada de rede. Confirmei que **não existe** `payroll-export` entre as 44 functions | `RelatoriosPage.tsx:278-300` · `audit-export.service.ts:42-70` · `ExamesPage.tsx:100-120` | Usuário legítimo com módulo de folha exporta mês a mês antes de pedir demissão. `audit_log` tem `CHECK (action IN ('insert','update','delete'))` — **SELECT não existe nesse modelo** | Tabela `data_export_events` + hook `registerExport({kind, scope, rowCount})` chamado com `await` **antes** de cada `writeFile`. Se o insert falhar, não exporta — a trilha é condição, não enfeite. Modelo pronto: `payment_2fa_events` foi criada exatamente por esse raciocínio |
| **M18** | **`bun.lockb` é do commit-template e não conhece a árvore atual** 📋 BACKLOG §3/§5 | `bun.lockb` · `Dockerfile:12-17` · `vercel.json:7` | Não conhece jspdf, xlsx, pdfjs-dist, `@supabase/supabase-js`, `@dnd-kit`, `@phosphor-icons`, react-markdown, `@playwright/test`; a única versão pinada de react-router é **6.30.1** — a que a Onda 1 diz ter subido pra 6.30.4. `Dockerfile:17` roda `bun install` **sem** `--frozen-lockfile`, com comentário assumindo a escolha | `bun install` + commitar o lockfile; `--frozen-lockfile` nos dois caminhos (ou `npm ci`, já que o `package-lock.json` está correto). Ter dois lockfiles divergentes é o defeito de raiz — escolha um |
| **M19** | **`xlsx` 0.18.5 sem correção (CVE-2023-30533 / CVE-2024-22363) parseando arquivo não confiável na aba do RH** 📋 BACKLOG §5 | `package.json:81` · `collaborator-import-parser.ts:196` · `VacationBalanceBulkImportDialog.tsx:111` | Planilha por e-mail → operador `admin_gc` abre Colaboradores → Importar → `XLSX.read` no mesmo realm do cliente Supabase. **O primitivo provado é poluição de `Object.prototype` e ReDoS**; escalada para execução na origem é plausível e **não foi provada** | `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (o npm não tem a correção) + regenerar o lockfile. Barato enquanto isso: mover o parse para um Web Worker |

### BAIXA

| # | Achado | Arquivo:linha | Nota |
|---|---|---|---|
| B1 🆕 | **`payment-2fa-enroll-start` valida a senha antes de qualquer freio.** O contador de `:302-326` conta `payment_2fa_challenges`, que só nasce depois da senha certa — senha errada não gasta nada | `payment-2fa-enroll-start/index.ts:174-198` vs `:302-326` | **Rebaixado por mim de `media`.** O mesmo oráculo está aberto em `/auth/v1/token` para qualquer anônimo com a anon key, e ali o prêmio é melhor (sessão válida). Como o `signInWithPassword` parte do runtime da function, o rate limit por IP do GoTrue bate no **atacante**, não a favor dele. Corrija movendo o freio para antes da senha e contando `enroll_password_failed` — mas não é prioridade |
| B2 🆕 | **A checagem de identidade da reconciliação falha em aberto quando a resposta não traz `id`** — o gateway ecoa o id perguntado (`main.ts:460`, `?? paymentId`), tornando a comparação de `reconcile:321-324` tautológica | `payroll-pix-reconcile/index.ts:318-325` · `santander-gw/main.ts:455-461` | Cenário não observado (o mock do sandbox **traz** id, e a ADR 0006 também). Correção de 2 linhas: `if (!returnedId || returnedId !== row.provider_payment_id) → inconclusive`, e o gateway devolver `provider_payment_id: null` + `requested_id` separado. **O gateway não deve inventar identidade sobre dinheiro** |
| B3 🆕 | **A trilha do 2FA aceita IP forjado e é inflável por qualquer autenticado** — `clientIp()` pega o **primeiro** elemento do `X-Forwarded-For`, e o `enroll_denied` é gravado **antes** do 403 | `payment-2fa-enroll-start/index.ts:151-166, :516-519` (idem confirm e pix-pay) | `user_id` **não** é forjável (vem do JWT) e `company_id` é FK, então só dá para sujar a própria empresa com IP falso. Usar `cf-connecting-ip`/último salto |
| B4 🆕 | 38 migrations sem bloco de rollback, contra a regra do CLAUDE.md — todas do fork de jan/fev, incluindo `user_roles`, `user_permissions`, `has_module_permission` e as policies de `collaborators` | `20260120010131` … `20260218221859` | Não é vulnerabilidade: é tempo de recuperação com bus factor = 1. Uma migration de documentação com o rollback comentado das 6 que tocam autorização resolve o essencial |
| B5 🆕 | `linkedin_url` de candidato anônimo cai direto no `href` do recrutador, sem validação de esquema | `CandidateDetailDialog.tsx:92-99` · `recruitment-apply/index.ts:206, :223` | **Não explora hoje**: a CSP do artefato (`script-src 'self'`, sem `unsafe-inline`) recusa `javascript:`, e `connect-src`/`img-src`/`form-action` fecham a exfiltração. Fica um `<a>` rotulado "LinkedIn" apontando para qualquer domínio (phishing) e uma mina se a CSP afrouxar. `if (!/^https?:\/\//i.test(u)) reject` no servidor |
| B6 🆕 | `src/lib/claude.ts:69-81` lê `VITE_ANTHROPIC_API_KEY` — código morto hoje, mas um único import inlina a chave paga no bundle público | `src/lib/claude.ts:69-81` | Nada em `src/` importa; o bundle atual só tem o JWT anon. O SDK se recusa a rodar em browser sem `dangerouslyAllowBrowser` — mas a substituição do Vite é **textual em build**, então a chave já estaria servida antes do erro de runtime. Mover para `supabase/functions/_shared/` e apagar |
| B7 🆕 | `.dockerignore` não exclui `deploy/certs/` nem `**/*.env`; `deploy/frontend.yml:14` usa `context: ..` e `Dockerfile:19` é `COPY . .` | `.dockerignore:1-14` | A imagem final está limpa (só `/app/dist`). O que sobra é a chave privada persistindo no snapshot store do BuildKit **depois de rotacionada e apagada** de `deploy/certs`. Higiene de ciclo de vida |
| B8 🆕 | `nginx.conf:11-12`: `real_ip_header X-Forwarded-For` + `set_real_ip_from 0.0.0.0/0`, na overlay compartilhada `network_public` | `nginx.conf:10-12` · `deploy/frontend.yml:24-25` | Só envenena o access log — o nginx serve estático e não toma nenhuma decisão por IP (sem `limit_req`, `allow/deny`, `geo`). Restringir a `10.0.0.0/8` + `172.16.0.0/12` |
| B9 | Currículo cru com CPF/RG enviado à LLM e resumo à OpenAI — **título corrigido**: existe consentimento (`AplicarPage.tsx:364-372`, `consent_lgpd_at`). Sobra **minimização**, transferência internacional sem salvaguarda versionada e o texto do consentimento não mencionar IA de terceiro | `cv-process/index.ts:267-297` · `_shared/embeddings.ts:33` | Extrair texto e redigir CPF/RG antes da chamada; mandar `Candidato #n` em vez do nome no `recruiter-search`; escrever `docs/adr/0007-tratamento-por-terceiros.md` com a tabela operador × dado × base legal × país × DPA |

---

## 4. Ordem de execução

Ordenado por **risco × esforço**, não por severidade. A observação que muda a ordem: **o módulo PIX ainda não está em produção**. Consertar A1/A2/A3 agora custa uma migration; consertar depois de uma folha real ter passado custa dinheiro que não volta.

### Hoje (antes de commitar a branch do PIX)

| O quê | Onde entra | Tempo |
|---|---|---|
| **1. `.gitignore`: `deploy/*.env`, `*.env`, `.env.*`, `!.env.example`** e apagar `.env.bak-cloud` da árvore | commit direto na branch atual | 2 min |
| **2. Migration nova `fix/pix-congelamento-imutavel`** — A1 (REVOKE + recusa de rebuild + tirar `financeiro.can_edit` do gate) **e** A2 (`reopen` sem `aprovado_diretoria` + gate por destino + `approved_dir_by IS NOT NULL` no `open_transfer`). As duas juntas: separadas, cada uma é contornável pela outra | `supabase/migrations/` com bloco de rollback. Branch `fix/pix-congelamento-imutavel` | 1-2 h |
| **3. Front: renderizar `desafio.payee_pix_key_masked` na tela do código** e parar de exibir a chave ao vivo antes | `PixPaymentDialog.tsx` — 5 linhas | 15 min |
| **4. `PROTECTED_ROLES` com `diretoria` no `update-user-password`** | edge function → `npm run deploy:fn update-user-password` (**a Vercel não sobe function**) | 10 min |

Os itens 2, 3 e 4 são a diferença entre "o 2FA autoriza um pagamento" e "o 2FA carimba um desvio".

### Esta semana

| O quê | Onde entra |
|---|---|
| **5. Aplicar a Onda 1 em produção.** É o único item que protege os 300 colaboradores **hoje**. As migrations já foram ensaiadas contra aquele banco (`SEGURANCA.md` §3) | `npx supabase db push` + `npm run deploy:fns` + regenerar types. Depois, os 5 testes manuais que a §3 lista |
| **6. Decidir o `/portal/primeiro-acesso` (A6).** Rode `select count(*) from collaborators where status in ('aguardando_documentacao','reprovado')`; dando 0, apague rota + functions + blocos do `config.toml` **e delete em produção** (`deploy --all` não remove) | painel/CLI do Supabase + commit |
| **7. A3 — corrida do pagamento em dobro.** RPC `payroll_pix_claim_for_send` + enum `sending` + invalidar desafios anteriores + dedupe real no `handleCreate` do gateway. E corrigir os dois comentários mentirosos sobre idempotência | migration nova + edge function + `santander-gw` (rebuild da imagem no compose da VPS) |
| **8. A4 — `audit_log`.** Redigir colunas no trigger + estreitar a policy de `gestor_gc` + backfill do histórico já gravado | migration nova com rollback |
| **9. M1 — aviso de troca de aparelho no WhatsApp antigo.** ~15 linhas em `payment-2fa-enroll-confirm` | edge function → `npm run deploy:fn payment-2fa-enroll-confirm` |

### Este mês

| O quê | Onde |
|---|---|
| 10. A7 (`collaborator-subresource`), M7 (`delete-collaborator`), M8 (`bonus-notify`), M3 (`whatsapp-api`), M13 (`whatsapp-webhook`), M14 (`public_url_origin`), M4 (`analyst-chat`) — todas edge function + `deploy:fns` | Uma branch `fix/edge-authz`, PR único |
| 11. M2 (SSRF do `cv-process`) — validação de destino + parar de devolver `trace`. E a nota de infra: rodar as functions de pagamento num runtime separado, em vez de `docker network connect bank_net supabase-edge-functions` (README:42) plugar as 44 na rede do banco | edge function + compose da VPS |
| 12. M6, M9, M12 — RLS por módulo em vez de por papel; `storage_is_company_staff` nos 3 buckets que ficaram com `storage_is_rh()` | migration nova |
| 13. M18/M19 — lockfile + `--frozen-lockfile` + `xlsx` pelo tarball do CDN. E o CI mínimo que o §5 já pede (`lint` + `test` + `npm audit --audit-level=high` + `deno check`), com um check que recusa migration sem `ROLLBACK` | `Dockerfile`, `vercel.json`, `.github/workflows/` |
| 14. M16/M17 — expurgo por tabela (`pg_cron`) e `data_export_events`. M15 (dois filtros de 5 minutos). B9 (ADR 0007) | migration + hook |
| 15. B2, B3, B4, B5, B6, B7, B8 | conforme tocar o arquivo |

---

## 5. O que NÃO é problema

Registro de cobertura — evita gastar tempo e documenta o que foi verificado.

**Verificado e correto no caminho do dinheiro:**
- **O 2FA em si é bem feito.** Não há TOTP: é OTP de 6 dígitos por WhatsApp com HMAC-SHA256 + pepper fora do banco e salt por desafio. O código em claro nunca toca o Postgres; `payment_2fa_challenges` tem RLS ligada, **zero policy** e `REVOKE ALL ... FROM anon, authenticated`. O enroll amarra tudo ao `auth.uid()` do JWT. Replay do **mesmo** código é impossível (`payment_2fa_consume_challenge` é um UPDATE único condicional com `consumed_at IS NULL` no WHERE).
- **O gate `challenge.transfer_id → transfer.entry_id === body.entry_id`** (`payroll-pix-pay:578-593`) impede pedir código para R$ 50 e usá-lo em R$ 50.000. É a trava certa, no lugar certo.
- **`payroll_pix_open_transfer`** tem advisory lock, `FOR UPDATE` na projeção, checagem de pensão alimentícia, de tipo de chave e de valor. O problema não é ela — é o `handleExecute`, que não a chama.
- **`santander-gw` tem a melhor higiene de log do repositório**: `mask.ts` com `maskDoc`/`maskPixKey`/`maskName`, logger em `Deno.stdout`, **valor do pagamento deliberadamente fora do log**, `SantanderError.baseMessage` separado de `message` para não ecoar a chave. Auth por `GW_SHARED_SECRET` com comparação em tempo constante sobre digests SHA-256, boot que recusa subir sem segredo, `/health` que **não lê** o conteúdo do certificado.
- **`santander-gw/Dockerfile`**: tag pinada, usuário não-root próprio, HEALTHCHECK, `--allow-read=/certs`, **não copia o certificado para dentro da imagem**. Compose sem `ports:`, sem label de Traefik, volume `:ro`.
- **`20260818120400`** de fato revogou a escrita direta do cliente em `payroll_payments` — inclusive com um `DO $$` que derruba policy de escrita criada fora do versionamento. **`payroll_payment_set_manual_paid`** é SECURITY DEFINER com `SET search_path`, sem GRANT para `anon`, carimba `paid_at`/`paid_by` **no servidor** e recusa desmarcar o que saiu por PIX. É melhoria real sobre o que existia.
- **A cadeia "colaborador → admin global" não alcança o dinheiro.** Verifiquei: `is_admin_gc` casa só `'admin_gc'`, e o trigger de auto-cadastro já falha por o enum `app_role` não ter mais `'admin'`. Mesmo em produção (onde a policy de INSERT em `companies` segue aberta), virar owner de uma empresa própria não dá módulo nem papel na empresa alvo.
- **Frontend:** `usePermissions`/`useMultiplePermissions`/`useSidebarPermissions` são fail-closed (erro e ausência de linha viram `false`; nada de "carregando = libera"). `PermissionGuard`/`RoleGuard` mostram spinner, não conteúdo. `react-markdown` 10 sem `rehype-raw` — HTML de LLM e de currículo é escapado. O único `dangerouslySetInnerHTML` é o de `ui/chart.tsx`, componente que ninguém importa. Nenhum `postMessage`, nenhum redirect aberto. Nenhum segredo no bundle além do JWT anon.
- **`useIsDeveloper`** é e-mail hardcoded, mas só esconde botões — as escritas correspondentes passam por edge function/RLS. Não é fronteira de privilégio.
- **Headers e CSP na VPS estão certos.** `security-headers.inc` reproduz os 8 headers do `vercel.json` e o `nginx.conf` faz `include` em cada `location` (com o comentário correto sobre `add_header` não ser herdado). A CSP viaja **dentro** do artefato (`<meta>`, `apply:'build'`), então não depende de Traefik/Cloudflare e não some numa troca de hospedagem.
- **Segredos no histórico do git: limpo.** Pickaxe (`git log --all -S`) em `sk-ant-api`, `sbp_`, `sk-proj-`, `SUPABASE_SERVICE_ROLE_KEY=` e busca por payload de JWT service_role em todos os blobs de todos os refs: nada. As 60 ocorrências de `service_role` no código são todas `Deno.env.get(...)` ou placeholder. Nenhum `.pem`/`.pfx`/`id_rsa` jamais adicionado.
- **`lovable-tagger`** é `mode === "development" && componentTagger()` em `vite.config.ts:87` — não entra no build de produção.
- **Não existe tabela sem RLS.** As 7 que o grep literal acusa (`collaborator_absences`, `_emails`, `_extras`, `_health_plans`, `_internships`, `_leaves`, `_pdvs`) recebem RLS por SQL dinâmico em `20260518193705:256-306`.
- **112 funções, 90 SECURITY DEFINER, zero sem `SET search_path`.** Todas as views têm `security_invoker = true`.

**Refutado ou corrigido nesta passada:**
- *"Não existe caminho de revogação do 2FA"* (#14/#16) — **falso**. `SecurityTab.tsx:99-106` tem "Trocar celular", e recadastrar o próprio número marca o aparelho do atacante como `revoked` (`enroll-confirm:190-215`). O defeito é só a **falta de aviso**.
- *"`payment-2fa-enroll-start` é um oráculo de senha sem limite"* (#25/#39/#40) — **rebaixado**. O oráculo já é público em `/auth/v1/token`, e este caminho é mais ruidoso e menos favorável ao atacante.
- *"Currículo enviado a LLM sem base legal"* (#50) — **falso**. Consentimento LGPD existe, é obrigatório no formulário e é carimbado no banco. Sobra minimização e transparência.
- *"`analyst-chat` vaza conversa alheia"* (#27/#44) — **parcialmente falso**. A policy `20260429160000:132-148` já dá a `gestor_gc`/`rh` SELECT em `agent_messages` de qualquer sessão da empresa. O delta real é a **escrita** e o caso cross-empresa.
- *"Rotas sem guard vazam PII"* (#26) — **rebaixado**. `PermissionGuard` é render-time sobre uma TanStack Query, não fronteira. 100% do impacto de PII é M12 (RLS por papel). E o `GlobalSearch` **não** devolve `collaborators` para quem não tem o módulo (`20260616120000:40-43` é `can_view_module`).
- *"SSRF do `cv-process` alcança o dinheiro"* (#32) — **corrigido**. O `fetch` é GET sem headers controláveis; `POST /pix/transfer` e o `PATCH confirm` exigem o `GW_SHARED_SECRET`, que a SSRF não injeta. O ganho é reconhecimento de rede.
- *"Extrair a chave privada pelo cache do BuildKit é escalada"* (#48) — **corrigido**. Quem monta o contexto é o cliente docker, que precisa **ler** `deploy/certs` (root:root 700). Sobra a persistência pós-rotação.
- **`service_role` em texto plano no `cron.job.command`** (`docs/setup-cron-pix-reconcile.sql:60`) — real, e o próprio SQL admite. **Não virou achado** porque ninguém provou quem alcança o schema `cron`: ele não está exposto no PostgREST e `authenticated` não tem `USAGE` nele por padrão.
- **Bucket público `curriculos` com 830 PDFs** (§7) — investigado e **não atribuído ao DNA**: o bucket próprio é `candidate-cvs` (privado, com policies), `curriculos` não aparece em nenhum `.ts`/`.tsx`/`.sql`, e a citação de `docs/API.md:202` provavelmente é erro de redação. **Mas encerre isso com uma consulta** (ver seção 6).
- **Policy "Anyone can read system settings"** (`20260121005330:14-17`) com `USING (true)` — a tabela hoje guarda só `primary_color`, e a policy de escrita morreu junto com `is_master_admin`. Leitura anônima de tema, sem valor de ataque.

---

## 6. Limites desta auditoria

Tudo acima vem de **leitura do repositório**. Nada foi executado contra banco, API ou produção. As lacunas, e o comando que fecha cada uma:

| Lacuna | Por que importa | Como fechar |
|---|---|---|
| **Estado real das policies e funções em produção** (`mxqbawfazgvdnyhrarlz`) e na VPS | A `20260818120400` documenta por escrito que **já existiram policies criadas pelo painel, fora do versionamento** (§7, descoberta 1). O repo pode divergir do que está no ar nos dois sentidos | `POST https://api.supabase.com/v1/projects/mxqbawfazgvdnyhrarlz/database/query` com `select schemaname, tablename, policyname, cmd, qual from pg_policies where tablename in ('payroll_periods','payroll_payments','audit_log','collaborators','collaborator_documents','collaborator_medical_certificates')` — leitura pura, sem transação |
| **Quais migrations e functions estão de fato aplicadas/deployadas** | `MEMORY.md` registra histórico de "deploy pela metade", e o `updated_at` das functions mente | `select version from supabase_migrations.schema_migrations order by version desc limit 20` e, para as functions, baixar o **corpo** de cada uma (não confiar no timestamp) |
| **Distribuição real de permissões** | A1, A2, A5 e A7 dependem de combinações concretas existirem em pessoas reais. A ausência do controle é certa; a exploração prática, não | `select up.user_id, up.module, up.can_edit, up.can_create, ur.role from user_permissions up join user_roles ur using (user_id) where up.module in ('financeiro','colaboradores','permissoes','folha_pagamento_exec')` |
| **Se a anon key satisfaz o `verify_jwt` desta instalação** | Define se M8 (`bonus-notify`) e o `?ping` de M2 alcançam anônimo ou só usuário logado. É o comportamento padrão do Supabase, mas ninguém exercitou a requisição | `curl -i -X POST https://<ref>.supabase.co/functions/v1/cv-process?ping=claude -H "Authorization: Bearer <anon>"` num ambiente de teste |
| **Limites de rate do GoTrue** (`/token?grant_type=password`) nos dois ambientes | Define se B1 é higiene ou exploração | Painel Supabase → Authentication → Rate Limits (Cloud) e as env `GOTRUE_RATE_LIMIT_*` no compose da VPS |
| **Configuração de sessão no servidor** | `SEGURANCA.md` §1 e §7 dizem que os prazos **não foram ligados** em nenhum dos dois. O guard roda no navegador; token copiado do `localStorage` passa por fora | Painel → Authentication → Sessions (JWT expiry 1800, rotação de refresh, inactivity 30 min, time-box 12 h) e `JWT_EXP`/`GOTRUE_*` no `docker-compose` da VPS |
| **Buckets: quem é público hoje** | Encerra a dúvida do `curriculos` e confirma o estado dos 3 buckets de PII em produção | `select id, public from storage.buckets` **nos dois ambientes** |
| **Comportamento real da API do Santander quanto a `tags`** | Se o Santander deduplicar por `tags`, A3 vira "registro inconsistente" em vez de PIX duplo. Nada no repo sustenta isso, e a ADR 0006 trata `tags` como texto livre | Teste controlado em sandbox: dois POST com o mesmo `idempotency_key`, comparar `provider_payment_id`. O README já avisa que o sandbox é mock sem estado e devolve ids diferentes — então isso só se prova em produção, com valor mínimo |
| **Conteúdo real de `deploy/santander-gw.env`, `deploy/frontend.env`, `functions-secrets.env` e `deploy/certs/`** | Nenhum existe nesta cópia. Toda a análise vem do que o README e o compose declaram | `ls -la` e `stat` na VPS; conferir `chmod 600`/`700` e se `PAYMENT_2FA_PEPPER`, `SANTANDER_*`, `GW_SHARED_SECRET` e `PIX_RECONCILE_SECRET` estão de fato setados |
| **Se o runtime de edge da VPS já está na `bank_net`** | O README manda `docker network connect bank_net supabase-edge-functions`; §7 não lista esse passo entre os aplicados. Muda o alcance de M2 | `docker network inspect bank_net --format '{{range .Containers}}{{.Name}} {{end}}'` |
| **Regras de Traefik/Cloudflare e a cadeia de proxy** | Define a posição do IP confiável no `X-Forwarded-For` (B3) e se `network_public` hospeda outros sistemas (B8) | `docker network inspect network_public` e a config de labels do Traefik |
| **Árvore transitiva de dependências resolvida** | `npm audit --offline` devolve `vulnerabilities: {}` sem consultar o registry — inútil. A avaliação foi por versão declarada | `npm audit --audit-level=high` com rede, e conferir se o build da Vercel está passando ou falhando com o `bun.lockb` divergente |
| **Se existe DPA/contrato com Anthropic, OpenAI, Evolution, Resend ou Santander** | B9 depende disso | Fora do repositório — decisão de PO |
| **Escalada de prototype pollution → execução na origem (M19)** | O primitivo está provado; o gadget concreto neste bundle, não | Só com navegador e um PoC controlado |

---

**Última observação, e é a que eu levaria para a reunião:** o módulo de pagamento tem o desenho de segurança mais cuidadoso do repositório — advisory locks, snapshot congelado, consumo atômico de desafio, gate triplo, log mascarado, comentários que explicam cada decisão. Os quatro achados ALTA da superfície nova não são descuido de quem não pensou; são **três `GRANT`/predicados que não acompanharam o desenho** (`GRANT ... TO authenticated` no builder, `reopen` aceitando `aprovado_diretoria`, a lista de papéis protegidos sem `diretoria`) e **uma corrida que o desenho previu na abertura e esqueceu na execução**. São todos consertáveis em uma migration e três edge functions — desde que antes da primeira folha real.