# Contribuindo pro SoftHouse

Guia pro fluxo de trabalho do dia-a-dia. Pra contexto do produto, ver [`CLAUDE.md`](CLAUDE.md).

## TL;DR

```bash
git checkout main && git pull
git checkout -b feat/minha-coisa
# ... código ...
git commit                              # template abre, preenche tipo + descrição
git push -u origin feat/minha-coisa
gh pr create                            # ou pelo UI do GitHub
# → squash merge → Vercel deploya → fim
```

---

## Branches

`main` é a única branch protegida. Tudo passa por branch curta:

| Prefixo | Pra que serve | Exemplo |
|---|---|---|
| `feat/` | Funcionalidade nova | `feat/reset-senha` |
| `fix/` | Bug em código já em prod | `fix/folha-totais-errados` |
| `chore/` | Manutenção sem afetar usuário | `chore/upgrade-supabase-cli` |
| `refactor/` | Mudança interna sem mudar comportamento | `refactor/extrai-helpers-ferias` |
| `docs/` | Só documentação | `docs/atualiza-roadmap` |
| `test/` | Só testes | `test/calcVacation-edge-cases` |

**Nome curto e descritivo.** Não usa underscores. Não usa nome de pessoa. Não usa data.

**Uma branch por tarefa.** Não acumula features em branch única — se misturar, depois é PR enorme misturando coisas que deveriam ter ido separadas.

---

## Commits

**Conventional Commits em pt-BR.** Mesmos prefixos das branches:

```
feat(folha): adiciona filtro de empresa nos lancamentos

Permite filtrar Pagamentos por empresa quando o usuário tem
acesso a varias. Antes só dava pra filtrar por setor.

Refs #45
```

**Regras:**
- Título no imperativo, ≤72 chars, sem ponto final
- Linha em branco entre título e corpo
- Corpo explica o **porquê** (motivo, contexto, decisão), não o **o quê** (diff já mostra)
- Cita issue/task se houver (`Refs #N`, `Closes #N`)

**Use `git commit` sem `-m`** — o template em `.gitmessage` abre no editor com guia. Pra forçar template em qualquer máquina:
```bash
git config commit.template .gitmessage
```

---

## Pull Requests

Mesmo solo dev, sempre via PR — não é cerimônia, é pra ganhar:
- Preview deployment automático da Vercel (testa antes do merge)
- Histórico legível com todos os PRs listados
- Reverter fácil se algo der errado em prod

**Título do PR** = mesmo do commit principal (`feat: ...`).

**Body do PR** tem 2 seções:
```markdown
## Summary
1-3 bullets do que mudou e por quê.

## Test plan
- [ ] Passo 1 que vou conferir
- [ ] Passo 2 ...
```

**Squash and merge sempre.** Configurado nas settings do repo — outros tipos de merge estão desabilitados pra manter histórico linear.

**Após o merge:**
1. GitHub apaga a branch remota automaticamente (`Auto-delete head branches` está on)
2. Você precisa apagar a local: `git checkout main && git pull && git branch -D feat/sua-branch`
3. Cria nova branch pra próxima tarefa

⚠️ **Não fica em branches longas.** Cada feature = 1 branch nova. Se ficar trabalhando na mesma branch após merge, commits vão aparecer como "órfãos" (squash não atualiza histórico da branch original).

---

## Migrations

Mudança em schema = migration nova. **Nunca edita migration já mergeada.**

```bash
npx supabase migration new <nome_curto>
# edita o SQL gerado em supabase/migrations/
npx supabase gen types typescript --local > src/integrations/supabase/types.ts
git add supabase/migrations/ src/integrations/supabase/types.ts
```

Cada migration tem:
- `BEGIN; ... COMMIT;` envolvendo
- Bloco `-- ROLLBACK` comentado no fim
- RLS habilitado em tabela nova
- Audit trigger se tem PII

Ver exemplos em `supabase/migrations/`.

---

## Edge Functions

Vercel só deploya o frontend. **Edge functions são deploy manual**:

```bash
# Deploy todas as functions
npm run deploy:fns

# Deploy uma específica
npm run deploy:fn update-user-name
```

**Quando deployar:**
- Após mergear PR que mexeu em `supabase/functions/<algo>/`
- Imediatamente — não acumula functions sem deploy

⚠️ Função no Git ≠ função em produção. Confirma sempre que deployou antes de testar.

---

## Hotfix em produção

Bug urgente em prod:

```bash
git checkout main && git pull
git checkout -b fix/hotfix-<descricao-curta>
# corrige
git commit
git push -u origin fix/hotfix-<descricao-curta>
gh pr create
# squash merge → deploy automático
```

Sem desvio: não tem branch `hotfix/` separada, é só `fix/` mesmo. O que importa é ser branch nova, PR rápido, merge.

---

## Tags / releases

Não usamos SemVer rigoroso (é interno). Marcamos milestones do roadmap:

```bash
git tag -a v0.2-fase-recrutamento -m "Fase 3 (recrutamento) entregue"
git push --tags
```

Tags são opcionais — só pra ter ponto de referência quando precisar voltar.

---

## Antes de pedir merge — checklist

- [ ] Branch tá com prefixo certo (`feat/`, `fix/`, etc.)
- [ ] Commits seguem Conventional Commits
- [ ] `npm run build` passa local
- [ ] `npm run lint` passa local
- [ ] Testes vitest passam (`npm test`)
- [ ] Se mudou schema: migration + types regenerados
- [ ] Se mudou edge function: anotou pra rodar `npm run deploy:fns` após merge
- [ ] PR tem `## Summary` e `## Test plan`
- [ ] Preview deployment da Vercel passou (aparece no PR)

---

## Configurações do repo (fazer 1x pelo owner)

Owner do repo abre **`Settings → General → Pull Requests`** no GitHub e deixa assim:

- ✅ Allow squash merging
- ⬜ Allow merge commit *(desmarca)*
- ⬜ Allow rebase merging *(desmarca)*
- ✅ Always suggest updating pull request branches
- ✅ Automatically delete head branches *(seção "Pull Requests" mais embaixo)*

Isso garante:
- Histórico linear na main (1 commit por feature)
- Branches apagadas automaticamente após merge
- Botão "Update branch" quando o PR está atrás da main
