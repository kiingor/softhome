# Segurança — DNA Softcom

Estado da blindagem e o que falta. Auditoria completa em 14/08/2026 (14 frentes,
98 achados brutos, refutação adversarial nos críticos/altos).

---

## 1. Expiração de sessão

O Supabase renova o JWT sozinho (`autoRefreshToken: true`), então uma sessão
aberta nunca morre por conta própria. Os dois limites abaixo são nossos.

| Peça | Arquivo |
|---|---|
| Política (prazos, relógios, mensagens, sinal entre abas) | `src/lib/security/session-policy.ts` |
| Motor (tick de 1s, eventos de atividade, `visibilitychange`, `storage`) | `src/hooks/useSessionTimeout.ts` |
| Aviso com contagem regressiva + encerramento | `src/components/security/SessionTimeoutGuard.tsx` |
| Montagem | `DashboardLayout.tsx`, `PortalGuard.tsx` |

**Prazos** (sobrescreva por `.env` — ver `.env.example`):

| | Inatividade | Absoluto | Aviso |
|---|---|---|---|
| Dashboard interno | 30 min | 12 h | 2 min antes |
| Portal do colaborador | 30 min | 8 h | 2 min antes |

Decisões que não são óbvias:

- `mousemove` **não** conta como atividade. Mouse encostado na mesa renovaria a
  sessão pra sempre.
- Com o aviso na tela, atividade passiva é ignorada: só o botão "Continuar
  conectado" renova. Rolar a página não pode cancelar o aviso sem o usuário ver.
- O relógio absoluto usa `user.last_sign_in_at` (servidor), não um timestamp
  local — recarregar a página não reinicia a contagem.
- Encerrar usa `signOut({ scope: "local" })`: revoga **esta** sessão no servidor
  sem derrubar o mesmo usuário no celular.
- Os relógios vivem no `localStorage`, então interação numa aba mantém as outras
  vivas e o encerramento derruba todas (o `auth-js` não faz esse broadcast).

Testes: `src/hooks/useSessionTimeout.test.ts` (11 casos).

### ⚠️ Falta ligar no painel do Supabase

O guard roda **no navegador**. Um token copiado do `localStorage` e usado via
`curl` passa por fora dele. Quem fecha isso é o servidor —
**Authentication → Sessions**:

| Config | Valor | Por quê |
|---|---|---|
| Access token (JWT) expiry | `1800` (30 min) | Janela máxima de um token roubado fora do browser |
| Refresh token rotation | ligado, reuse interval 10s | Refresh roubado só serve uma vez |
| Inactivity timeout | 30 min | Espelha `idleMs` no servidor |
| Time-box user sessions | 12 h | Espelha `absoluteMs` no servidor |

E em **Authentication → Policies**: comprimento mínimo **8** (igual a
`src/lib/security/password-policy.ts`) e **Leaked password protection** ligada.

Se mudar `VITE_SESSION_*`, mude o painel junto.

---

## 2. Cabeçalhos e CSP

- **CSP**: injetada no `index.html` em tempo de build pelo plugin `dna-csp`
  (`vite.config.ts`). Vai como `<meta http-equiv>` de propósito — acompanha o
  artefato e continua valendo em qualquer hospedagem (Vercel hoje, VPS depois),
  sem reconfigurar proxy. A origem do Supabase sai do `.env` do build.
- **Headers HTTP** (`vercel.json`): HSTS, `frame-ancestors 'none'`,
  `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP.

Ao migrar pra VPS, **reimplemente os headers no Traefik/nginx** — o `vercel.json`
deixa de valer. A CSP continua funcionando sozinha.

Se aparecer domínio externo novo (fonte, API, CDN), a CSP precisa saber: mexa nas
listas em `vite.config.ts`.

---

## 3. Aplicando a Onda 1 em produção

As migrations `20260814100000`–`20260814100400` foram ensaiadas contra o banco
real dentro de `BEGIN … ROLLBACK` (Management API honra transação). O ensaio
mostrou o estado final correto e a simulação de ataque confirmou o efeito:

| Cenário (usuário real de produção) | Antes | Depois |
|---|---|---|
| `colaborador` lê `exam-documents` (ASO) | 2 arquivos | **0** |
| `gestor_gc` / `admin_gc` leem `exam-documents` | 2 | 2 |
| `colaborador` cria empresa (→ virava admin global) | passava | **bloqueado** |
| Qualquer um troca o próprio `profiles.company_id` | passava | **bloqueado** |
| `anon`/`authenticated` chama RPC de escrita | passava | **bloqueado** |

Ordem de aplicação:

```bash
npx supabase db push
npx supabase gen types typescript --project-id mxqbawfazgvdnyhrarlz > src/lib/supabase/types.ts
npm run deploy:fns   # Vercel não deploya edge function
```

Depois de aplicar, **teste na mão** (essas telas usam o client do usuário, não
service_role):

- `ContabilidadePage` — upload e remoção de contracheque
- `CollaboratorValidationTab` — download de documento
- `ExamUploadModal` / `MeusExamesPage` — ASO
- `ConfiguracoesPage` — troca da logomarca
- `CollaboratorModal` — vincular usuário a colaborador

`bun.lockb` está desatualizado em relação ao `package.json` (jspdf e
react-router-dom subiram). **Rode `bun install` e commite o lockfile antes do
merge** — a Vercel usa `bun install`, que em CI é `--frozen-lockfile` e falha com
lockfile divergente.

---

## 4. O que a Onda 1 fechou

| Item | Arquivo |
|---|---|
| 3 buckets de PII (contracheque, RG/CPF, ASO) liberados pra qualquer autenticado — e `collaborator-documents` gravável por **anônimo** | `20260814100000` |
| Auto-cadastro de empresa + trigger que dava papel `admin` global | `20260814100100` |
| Colaborador reescrevia o próprio `current_salary` e `pix_key` | `20260814100200` |
| Qualquer um trocava o próprio `company_id` e atravessava o multi-CNPJ | `20260814100300` |
| RPCs `SECURITY DEFINER` de escrita chamáveis por `anon` | `20260814100400` |
| `update-user-password` trocava a senha de qualquer usuário (IDOR → takeover) | edge function |
| `create-collaborator-user` sobrescrevia a senha de conta existente | edge function |
| `send-invite-email` aceitava qualquer string como `Authorization` | edge function |
| `recruitment-apply`: injeção de filtro PostgREST no `.or()` | edge function |
| `/dashboard` e `/dashboard/folha` sem gate de papel/permissão | frontend |
| Senha mínima de 6 → 8, numa fonte única | `password-policy.ts` |
| `.env` versionado no git | `git rm --cached` |
| `jspdf` 4.0.0 → 4.2.1 (crítico), `react-router-dom` 6.30.1 → 6.30.4 (alto) | `package.json` |

### Antes de fazer merge

`send-invite-email` passou a exigir a origem pública por variável de ambiente:

```bash
npx supabase secrets set PUBLIC_APP_ORIGIN=https://<dominio-do-dna>
```

Sem isso a function devolve 500 (o CTA antes apontava pra `meurh.com.br`, domínio
do SaaS de origem — fora do controle da Softcom).

---

## 5. Backlog (Onda 2 e 3)

Priorizado, com correção concreta, no relatório da auditoria. Resumo:

**Onda 2 — defesa em profundidade**
- Módulos que só existem no React (`folha`, `decimo_terceiro`, `candidatos`,
  `vagas`, `admissoes`, `jornada`): revogar na tela de Permissões não revoga nada
  no banco. Honrar em `payroll_payments` (expõe PIX) e apagar os fantasmas.
- `payroll_periods`: `DELETE` sem trava de status — `diretoria` apaga período já
  aprovado e leva as aprovações junto por cascade.
- `whatsapp-api` sem checagem de empresa; `whatsapp-webhook` sem assinatura e
  logando o corpo inteiro (telefone em log viola o princípio 1 do CLAUDE.md).
- `public_url_origin` vindo do cliente em `admission-send-token`,
  `admission-send-whatsapp` e `application-test-notify`.
- `collaborator-subresource`: `localId` do body não é amarrado ao colaborador.
- Trio `onboarding-*`: `verify_jwt = false` + service_role, CPF como única
  credencial, devolve PII e salário. **Ver seção 6.**
- `installCommand` pra `npm ci` (build determinístico) e `xlsx` pelo tarball do
  CDN da SheetJS (o do npm está sem correção).

**Onda 3 — maturidade**
- Retenção LGPD: "remover candidato" hoje só faz `is_active = false` e a UI diz
  que removeu — resposta falsa a pedido do titular (art. 18 VI).
- Expiração/revogação dos links de teste de candidato (a expiração foi removida
  em `20260702120000`; hoje o link vale pra sempre).
- Audit triggers faltantes em `collaborator_timeline_events`,
  `collaborator_uniform_sizes`, `payroll_validations(_items)`,
  `payroll_period_approvals`.
- CI mínimo (`lint` + `test` + `npm audit --audit-level=high` + `deno check`) e
  Dependabot semanal.
- MFA TOTP só pra `admin_gc` e `diretoria`.
- Testes de RLS por papel em `__tests__/rls` — é o que impede a regressão de
  `20260616120000`, quando a policy de `collaborators` sumiu uma vez.

---

## 6. `/portal/primeiro-acesso` — RESOLVIDO (opção A, 18/08/2026)

> **Fechado.** Escolhida a opção A (desligar). Confirmado 0 colaboradores em
> `aguardando_documentacao`/`reprovado`. Removidos do repo: as 3 functions
> `onboarding-*`, a rota `/portal/primeiro-acesso`, o import em `App.tsx`, o
> botão em `PortalLogin` e os blocos do `config.toml`. Na VPS: as 3 pastas
> saíram de `volumes/functions` (backup em `/root/dna-app/_removed_onboarding_20260818`),
> o dispatcher `main` foi limpo e o edge-runtime reiniciado — `onboarding-lookup`
> agora responde erro de boot, não mais PII. **Produção Cloud ainda tem o trio
> vivo** (ver seção 8). Se um dia o self-service voltar, renasce token-gated
> (link por-contratado), nunca por CPF. O texto original abaixo fica de registro.

`onboarding-lookup` roda com `verify_jwt = false` e service_role, aceita **só o
CPF** e devolve nome, e-mail, telefone, cargo, CNPJ, lançamentos de folha com
valores e caminhos de documento. CPF não é segredo no Brasil — na prática é um
endpoint anônimo de consulta de PII e salário. `onboarding-action` e
`onboarding-upload` completam o trio, aceitando `collaborator_id` do corpo da
requisição sem verificar posse.

Duas saídas, e a escolha é de produto:

**A. Desligar** (recomendado). A admissão real usa `/admissao/:token`, com token
e expiração validados no servidor. O caminho vivo de criação de colaborador
grava `status: 'ativo'`; quem alimentava `aguardando_documentacao` é componente
morto. Confirme antes:

```sql
select count(*) from collaborators where status in ('aguardando_documentacao','reprovado');
```

Se der 0: apagar a rota, o link em `PortalLogin`, as 3 functions e os blocos do
`config.toml` — e **apagar em produção**, porque `deploy --all` não remove
function excluída do repo:

```bash
npx supabase functions delete onboarding-lookup --project-ref mxqbawfazgvdnyhrarlz
npx supabase functions delete onboarding-action --project-ref mxqbawfazgvdnyhrarlz
npx supabase functions delete onboarding-upload --project-ref mxqbawfazgvdnyhrarlz
npx supabase functions delete asaas            --project-ref mxqbawfazgvdnyhrarlz  # nem existe no repo
```

**B. Manter com token**, no mesmo padrão da admissão: `access_token` +
`expires_at` em `onboarding_sessions`; as três functions passam a receber só o
token, resolvem `collaborator_id`/`company_id` **do banco** e ignoram o que vier
no corpo; o lookup para de devolver `payroll_entries` e benefícios.

---

## 7. Estado na VPS (homologação)

Aplicado em 17/08/2026 em `vm-squad-ia-02`, a partir da branch
`release/vps-homolog` (redesign + segurança + infra).

| Camada | Estado |
|---|---|
| 6 migrations no Postgres self-hosted | aplicadas e registradas em `schema_migrations` |
| Edge functions alteradas | copiadas pra `/root/supabase/volumes/functions`, container recriado, boot conferido por OPTIONS |
| `PUBLIC_APP_ORIGIN` e `SUPABASE_PUBLIC_URL` | adicionados a `functions-secrets.env` |
| Frontend | reconstruído de `git archive` da branch; CSP embutida aponta pro host da VPS |
| Headers de segurança | 8 headers, conferidos no container **e** pela borda do Cloudflare |

Backups automáticos deste deploy: `/root/dna-app-backup-<ts>` (código),
`/root/fn-backup-<ts>` (functions), `/root/supabase/functions-secrets.env.bak-<ts>`.

**Acesso:** há uma chave SSH dedicada (`~/.ssh/dna_vps_ed25519`, comentário
`claude-code-deploy-dna`) em `/root/.ssh/authorized_keys`. Revogue apagando a
linha se não for mais usar.

### Duas descobertas que só apareceram na VPS

**1. As policies de storage nunca foram versionadas.** Elas foram criadas pelo
painel do Supabase Cloud, então o restore do dump não as trouxe: a VPS ficou com
RLS ligada em `storage.objects` e **zero policies** — deny-by-default, nenhum
documento abria nem pro RH. A migration `20260814100500` reproduz em SQL as
policies dos buckets que faltavam (admission-docs, candidate-cvs,
medical-certificates, collaborator-photos) e é idempotente, então roda nos dois
ambientes. Conferido depois de aplicar: RH vê os 70 documentos de admissão e os
156 currículos; `colaborador` vê zero.

**2. Existe um bucket `curriculos` público com 830 PDFs.** Não existe na
produção Cloud, não é referenciado em lugar nenhum do código do DNA, e os
arquivos são de 12/08/2026 — o dia em que a migração começou. Provavelmente é de
outro sistema nesta mesma instância self-hosted. **Não foi tocado**, porque
mexer nele pode quebrar quem o usa. Se for do DNA, é vazamento de currículo por
URL pública e precisa virar bucket privado com policy.

### O que a VPS ainda não tem

- ~~**Prazos de sessão no servidor.**~~ **FEITO em 18/08/2026** (ver seção 10):
  `GOTRUE_SESSIONS_TIMEBOX=12h`, `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=2h`, rotação
  de refresh token com detecção de reuso e senha mínima 10, no compose do auth.
- **Fontes vindas do Google.** `index.css` importa Inter e JetBrains Mono de
  `fonts.googleapis.com`. Num sistema interno isso é dependência externa e cada
  navegador de colaborador bate no Google. Hospedar as fontes junto do app
  resolve e ainda permite apertar a CSP (sai `style-src`/`font-src` externos).

---

## 8. Produção (Vercel + Supabase Cloud) continua com os buracos abertos

O deploy da VPS **não mexeu em produção** — e produção é onde estão os ~300
colaboradores hoje. Lá seguem valendo:

- os 3 buckets de PII abertos pra qualquer autenticado, com escrita anônima em
  `collaborator-documents`;
- o auto-cadastro de empresa com o trigger de papel global;
- o IDOR do `update-user-password`;
- e o resto da ONDA 1.

As mesmas migrations e functions resolvem, e já foram ensaiadas contra aquele
banco. Falta só o aval pra aplicar.

---

## 9. Como diagnosticar em produção sem escrever nada

`POST https://api.supabase.com/v1/projects/<ref>/database/query` executa vários
statements e honra transação explícita. Dá pra ensaiar uma migration inteira
contra dados reais mandando `BEGIN;` + o corpo da migration (sem o `BEGIN`/
`COMMIT` dela) + os `SELECT` de conferência + `ROLLBACK;`. DDL é transacional no
Postgres, então `CREATE POLICY` e `CREATE FUNCTION` também voltam atrás.

Sempre inclua `SET LOCAL lock_timeout` — mexer em `storage.objects` pega
`ACCESS EXCLUSIVE` e você não quer isso preso em produção.

---

## 10. Onda 2 — anti-invasão (18/08/2026, VPS)

Foco em três vetores: **estranho da internet**, **conta de funcionário
comprometida** e **vazamento de dados**. Tudo aplicado e conferido na VPS de
homologação; branch `security/anti-invasao-onda2`.

### 10.1. Vazamento anônimo por CPF — FECHADO

O trio `onboarding-*` foi removido (ver seção 6). Era o buraco aberto mais grave:
endpoint anônimo que devolvia PII + salário a quem soubesse um CPF.

### 10.2. Endurecimento do GoTrue (sessão + senha)

No `docker-compose.yml` do auth, container recriado e conferido saudável:

| Variável | Valor | Protege |
|---|---|---|
| `GOTRUE_SESSIONS_TIMEBOX` | `12h` | teto absoluto da sessão |
| `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` | `2h` | refresh token roubado e ocioso morre |
| `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED` | `true` | rotação de refresh token |
| `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` | `10` | reuso de token rotacionado revoga a família |
| `GOTRUE_PASSWORD_MIN_LENGTH` | `10` | senha mínima (só afeta novas senhas) |

Inatividade ficou em **2h** (não 30 min) de propósito: o supabase-js só renova o
token a cada ~50 min, então um valor menor derrubaria usuário ativo. O guard de
30 min continua no navegador (seção 1); os 2h são a rede server-side pro token
roubado. **HIBP (senha vazada) ficou de fora** — risco de fail-closed na troca de
senha; é opcional e fácil de ligar depois.

### 10.3. MFA de login forte (AAL2 via WhatsApp) — papéis admin_gc/diretoria

Escolha do usuário: código no WhatsApp MAS com garantia dura (não é só tela).

- **MFA nativo do GoTrue (fator telefone)** — `GOTRUE_MFA_PHONE_ENROLL/VERIFY_ENABLED`.
  Verificar o fator eleva o JWT a **AAL2**.
- **Entrega pela Evolution** — `GOTRUE_HOOK_SEND_SMS_ENABLED` aponta pro edge
  function `mfa-send-whatsapp`, que verifica a assinatura standardwebhooks (HMAC)
  do GoTrue e manda o código pela instância de WhatsApp da empresa. **Nunca loga o
  OTP.** O segredo do hook vive em `functions-secrets.env`
  (`MFA_SEND_SMS_HOOK_SECRET`) e no compose do auth (`GOTRUE_HOOK_SEND_SMS_SECRETS`).
  - Armadilha resolvida: GoTrue recusa `http://` pra host não-local, então a URI
    do hook é a **URL HTTPS externa** (`…/functions/v1/mfa-send-whatsapp`), que
    passa pelo envoy sem apikey porque a função está no set `FUNCTIONS_PUBLICAS`
    do dispatcher `main` (autenticação é o HMAC, não JWT).
- **RLS exige AAL2** (migration `20260818130000_mfa_aal2_rls.sql`): helper
  `public.mfa_satisfied()` = *(JWT é aal2)* **OU** *(usuário sem fator
  verificado)*, aplicado como policy **RESTRICTIVE** (ANDa com as permissivas, sem
  reescrever nenhuma) em `collaborators`, `payroll_entries`, `payroll_payments`,
  `payroll_pix_transfers`, `payroll_payable_lines`, `collaborator_documents`.
  - **Anti-lockout:** o ramo "sem fator" deixa rh/gestor/colaborador e admins
    ainda-não-enrolados entrarem em aal1 normalmente. Com **0 fatores hoje**, a
    migration nasce inócua e só passa a exigir aal2 para cada usuário DEPOIS que
    ele enrola. Provado em dry-run: sem fator+aal1→passa, com fator+aal1→bloqueia,
    com fator+aal2→passa.
- **Frontend** (`src/components/security/Mfa*`, `src/hooks/useLoginMfa.ts`):
  enroll na aba Configurações→Segurança, step-up bloqueante no `DashboardLayout`
  quando a sessão está em aal1 com fator verificado, e um nudge dispensável pra
  papel admin sem fator. Build Vite ok.

**Garantia e limites, honestos:**
- É parede de verdade contra "estranho com a senha" e "conta comprometida":
  sem o código no WhatsApp, o JWT não chega a AAL2 e a RLS barra os dados
  sensíveis — inclusive batendo direto na REST com a anon key.
- **Depende da Evolution no login.** Se o WhatsApp cair, um admin já enrolado não
  passa no 2º fator e fica em aal1 (vê o shell, não os dados sensíveis). Não é
  lockout total; break-glass = remover o fator via `service_role`
  (`delete from auth.mfa_factors where user_id=…`).
- **v1 não tranca quem não enrolou** (nudge, não bloqueio) pra não arriscar
  deixar todo admin de fora num dia de rollout. Enquanto um admin não enrola, ele
  não tem proteção — por isso o empurrão pra enrolar é forte. Virar
  obrigatório é um passo pequeno depois que todos estiverem enrolados.

### 10.4. Rate-limit de IA (endpoints públicos) — `/aplicar` e triagem

Migration `20260818140000_rate_limit.sql`: tabela `rate_limit_events` + função
`rate_limit_take(bucket, identifier, max, window)` (SECURITY DEFINER, só
service_role). Helper `_shared/rate-limit.ts` (fail-open). Ligado em:

- `recruitment-apply` — 5/10min por CPF + teto global 60/min. Provado: 6ª
  chamada com o mesmo CPF → **429**.
- `cv-process` — 10/10min por candidato + global 90/min.

Por identificador (não por IP) de propósito: atrás do proxy o IP real do cliente
se perde (todos chegam como `172.19.0.1`).

### 10.5. Rate-limit de login por IP — NÃO feito (inviável hoje)

Mesmo motivo do IP perdido: apertar o limite do GoTrue viraria balde global
compartilhado = DoS. Fazer certo exige consertar a cadeia de forwarded-IP na
borda (Traefik `forwardedHeaders`/`trustedIPs` + envoy + o terminador TLS da
hostsoftcom) — mudança de plataforma. O risco que ele cobre (força bruta de
senha) é coberto pelo MFA (10.3) + rotação de token (10.2). **Follow-up de
infra**, não de aplicação.

### 10.6. Pendências desta onda

- ~~**Deploy do frontend na VPS**~~ **FEITO em 19/08/2026.** Rebuild da imagem
  `dna-frontend` (Dockerfile bun→nginx) a partir de um `git archive` da branch,
  `frontend.env` apontando pra API da VPS (`api-dna-squad-ia-02.hostsoftcom.cloud`).
  Serve em `dna-squad-ia-02.hostsoftcom.cloud`; bundle sem `onboarding-*`, com MFA
  e botões PIX, headers de segurança conferidos. **Ainda é a URL de homologação** —
  o frontend está buildado pra ela, não pro domínio final (ver "virada de domínio"
  abaixo).
- **Virada de domínio (`dnasoftcom.com`) é um passo coordenado, NÃO só apagar a
  Vercel.** Hoje o frontend da VPS responde só em `*-squad-ia-02.hostsoftcom.cloud`.
  Apontar `dnasoftcom.com` pra VPS exige, num passo só: (a) rebuild do frontend com
  `VITE_SUPABASE_URL=https://api.dnasoftcom.com` + `APP_HOST=<domínio>`; (b) router
  do Traefik do frontend e do envoy passando a casar o domínio novo; (c)
  `GOTRUE_SITE_URL`, `GOTRUE_URI_ALLOW_LIST` e a **URI do hook de MFA** (fixa em
  `api-dna-squad-ia-02.hostsoftcom.cloud`) atualizadas pro domínio novo — senão o
  login com MFA quebra; (d) CSP acompanha sozinha (deriva de `VITE_SUPABASE_URL`).
  Desativar a Vercel ANTES disso derruba `dnasoftcom.com` até a virada.
- **Produção Cloud segue com tudo aberto** (seção 8) — inclusive o trio
  `onboarding-*`. Nada desta onda tocou produção.
- **Rotacionar segredos que passaram em chat** (comprometidos): senha do root da
  VPS, senha do certificado Santander, key da Evolution. E a chave SSH
  `dna_vps_ed25519` quando não for mais usar.
- **Lacunas de reprodutibilidade na VPS** (config que só existe no servidor, não
  no repo): o dispatcher `main/index.ts` (set `FUNCTIONS_PUBLICAS`) e os blocos
  GoTrue/MFA/hook do `docker-compose.yml` base. Um rebuild da VPS a partir do
  repo não os recria. Versionar num override é dívida a pagar.
- **Storage AAL2 e mais tabelas** no gate `mfa_satisfied()` são extensões
  triviais (uma policy RESTRICTIVE a mais por alvo) quando quiserem ampliar.
- **Unificar os dois cadastros de telefone**: o 2FA de pagamento (app-layer) e o
  MFA de login (GoTrue nativo) são fatores separados hoje; o pagador enrola duas
  vezes. Unificar é backlog.
