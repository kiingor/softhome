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

## 6. Decisão pendente: `/portal/primeiro-acesso`

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

## 7. Como diagnosticar em produção sem escrever nada

`POST https://api.supabase.com/v1/projects/<ref>/database/query` executa vários
statements e honra transação explícita. Dá pra ensaiar uma migration inteira
contra dados reais mandando `BEGIN;` + o corpo da migration (sem o `BEGIN`/
`COMMIT` dela) + os `SELECT` de conferência + `ROLLBACK;`. DDL é transacional no
Postgres, então `CREATE POLICY` e `CREATE FUNCTION` também voltam atrás.

Sempre inclua `SET LOCAL lock_timeout` — mexer em `storage.objects` pega
`ACCESS EXCLUSIVE` e você não quer isso preso em produção.
