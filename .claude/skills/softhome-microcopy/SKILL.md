---
name: SoftHouse-microcopy
description: Use this skill when writing user-facing strings (UI labels, toasts, empty states, error messages, confirmation dialogs, button copy) for SoftHouse. Triggers on requests to write or improve copy in pt-BR for the SoftHouse RH system. Applies the tone defined in docs/DESIGN_SYSTEM.md section 4 — friendly, direct, no infantilism, emoji only in welcome/achievement contexts.
model: sonnet
---

# SoftHouse Microcopy

Skill que codifica o tom e padrão de microcopy do SoftHouse (ver `docs/DESIGN_SYSTEM.md` seção 4).

## Quando usar

- Escrever toasts, alertas, mensagens de erro, confirmações
- Empty states (ilustração + título + CTA)
- Labels de botões, inputs, tooltips
- Notificações no Portal do Colaborador
- Emails transacionais

## Quando NÃO usar

- Textos legais (LGPD, termos, audit log) — mantém tom sério, formal
- Holerite, contracheque, documentos oficiais
- Avisos de exclusão de dados pessoais
- Erros críticos com código pra suporte (esses são técnicos, formais)

## Tom

**Amigável em pt-BR brasileiro. Direto, sem rebuscar.** Imagine Slack interno entre colegas de boa, não comunicado oficial.

- ✅ "Tá vazio por aqui. Bora cadastrar o primeiro?"
- ❌ "Nenhum registro encontrado no sistema."
- ✅ "Esse CPF não tá batendo, dá uma conferida?"
- ❌ "CPF inválido."

## Emoji

**Só em conquista/boas-vindas.** Nunca em erro, ação destrutiva, ou lista de trabalho.

- ✅ Welcome, conquista, sucesso de longo prazo: 👋 ✓ 🎉
- ❌ Erro, exclusão, alerta: sem emoji

## Padrão por contexto

### Toasts de sucesso

| Operação | Texto |
|---|---|
| Cadastro | `"Pronto ✓"` ou `"<Substantivo> cadastrado ✓"` |
| Edição | `"Atualizado ✓"` ou `"Pronto ✓"` |
| Exclusão | `"Removido."` (sem emoji em ações destrutivas) |
| Conquista de algo grande | `"Conquistou uma insígnia! 🎉"` |
| Login | `"Bem-vindo de volta!"` ou `"Que bom te ver 👋"` |

### Toasts de erro

Sempre **não-acusatório, com ação possível**:

- `"Não rolou. Tenta de novo?"` (genérico)
- `"Esse email já tá no sistema."` (conflito)
- `"Faz tempo que tu não mexe. Loga de novo?"` (sessão expirada)
- `"Esse documento precisa de ajuste. Veja o motivo."` (rejeição)
- `"Algo não foi bem aqui. Tenta de novo?"` (erro 500)

Nunca:
- "Erro ao processar requisição" (técnico)
- "Operação falhou" (acusatório, não-acionável)

### Empty states

Estrutura: ilustração + **título amigável** + descrição curta + CTA.

```
🎯 Tá vazio por aqui

Cadastra o primeiro colaborador
pra começar.

[ + Novo colaborador ]
```

Variantes por módulo (escolha um pareado de título + CTA):

| Contexto | Título | CTA |
|---|---|---|
| Colaboradores | "Tá vazio por aqui." | "Cadastrar primeiro colaborador" |
| Insígnias (catálogo) | "Tá vazio por aqui." | "Cadastrar insígnia" |
| Conquistas (Jornada) | "Ninguém conquistou ainda. Bora reconhecer alguém?" | "Atribuir agora" |
| Candidatos | "Ainda não chegou ninguém. Bora divulgar a vaga?" | "Compartilhar vaga" |
| Folha — período sem lançamentos | "Mês ainda zerado." | "Lançar primeiro" |
| Filtro vazio | "Ninguém com esse filtro." | (sem CTA, hint pra mudar filtro) |
| Search vazio | "Nada com esse nome." | (sem CTA) |

### Confirmação destrutiva (AlertDialog)

```
Título: "Tem certeza?"
       OU "Remover <X>?"
Descrição: o que vai acontecer + se é reversível.
            Tom direto, sem dramatizar.
Botão confirma: ação no infinitivo ("Remover", "Cancelar assinatura")
Botão cancela: "Voltar" ou "Cancelar"
```

✅ "Tem certeza? Essa ação não tem volta."
✅ "Remover insígnia? Atribuições já feitas não são afetadas."
❌ "Atenção! Você está prestes a executar uma ação irreversível!"

### Validação inline (zod messages)

Curto e específico. Foca no que fazer, não no erro:

| Validação | Mensagem |
|---|---|
| Required | "Preenche aqui?" ou "Falta esse." |
| Email malformado | "Esse email tá com algo errado." |
| CPF inválido | "Esse CPF não tá batendo, dá uma conferida?" |
| CNPJ inválido | "Esse CNPJ tá com algo errado, confere aí?" |
| Min length | "Tá curto demais." |
| Max length | "Passou do limite (<N> caracteres)." |
| Date no futuro quando devia ser passado | "Essa data ainda não chegou." |
| Selecionar de lista | "Escolhe um?" |

### Botões

Verbo no **infinitivo** ou imperativo. Nunca "Sim/Não" em diálogo importante.

| Ação | Texto | Variante |
|---|---|---|
| Confirmar/Salvar | "Salvar" / "Cadastrar" / "Confirmar" | primary (emerald) |
| Cancelar | "Cancelar" / "Voltar" | ghost ou outline |
| Excluir | "Remover" / "Excluir" | destructive |
| Aprovar | "Aprovar" | primary |
| Rejeitar | "Pedir ajuste" / "Rejeitar" | amber ou destructive |
| Adicionar | "+ Novo <X>" | primary |
| Filtrar | "Filtrar" / "Aplicar filtros" | secondary |

### Loading

- ✅ "Buscando os dados..." / "Salvando..." / "Enviando..."
- ❌ "Carregando..." (genérico, sem informação)

Pra spinners pequenos sem texto, ok deixar mudo (Loader2 só visual).

### Sucesso pós-conquista (badges, admissão concluída, primeiro acesso)

Use 🎉 ou ✓:

- "Conquistou uma insígnia! 🎉"
- "Admissão concluída ✓"
- "Pronto, tu já tá dentro 👋"

### Notificações WhatsApp/email

Tom consistente com UI, mas mais formal pelo canal:

- ✅ "Oi <Nome>, sua admissão tá quase lá. Faltam: <docs>."
- ❌ "Prezado(a) Sr(a). <Nome>, em referência à sua admissão..."

Mantém pessoalidade do "tu/você" (preferência: tratar por "você").

## Padrão de redação

1. **Frases curtas.** Se passou de 15 palavras, corta.
2. **Voz ativa.** "Cadastramos seu colaborador" > "Seu colaborador foi cadastrado."
3. **Segunda pessoa.** "Você" ou "tu" — escolha consistente. SoftHouse usa **"você"** (mais brasileiro neutro), mas em contextos de descontraído como toasts pode usar "tu" eventualmente.
4. **Português br, não pt-pt.** "Você" não "tu" formal, "celular" não "telemóvel", etc.
5. **Sem jargão técnico.** "Erro 500" é pra log, não pra usuário. Pro usuário: "Algo não foi bem aqui."
6. **Sem inglês desnecessário.** "Salvar" não "Save", "Buscar" não "Search". Mas mantém termos consagrados: "login", "dashboard", "kanban".

## Mantém sério em

- Termos legais e LGPD (texto da política, consentimento)
- Audit log (formal, técnico)
- Holerite/contracheque (documento oficial)
- Aviso de exclusão de dados pessoais
- Erro crítico de sistema (com código pra suporte): "Erro <CODE>. Reporta isso ao suporte."

## Checklist antes de aprovar microcopy

- [ ] Curto e direto
- [ ] Voz ativa
- [ ] Sem acusação ao usuário
- [ ] Sem jargão técnico
- [ ] Pt-br brasileiro
- [ ] Emoji só se for conquista/boas-vindas
- [ ] Botão com verbo no infinitivo
- [ ] Empty state tem CTA acionável (exceto search/filtro vazio)
- [ ] Confirmação destrutiva diz se é reversível e o que acontece
