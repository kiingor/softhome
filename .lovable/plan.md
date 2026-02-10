
# Plano Completo: 5 Correções e Melhorias

## 1. Scroll no Modal do Colaborador (monitores pequenos)

**Problema:** O modal usa altura fixa que nao permite scroll em monitores pequenos, impedindo ver campos como Data de Admissao.

**Solucao:**
- Arquivo: `src/components/collaborators/CollaboratorModal.tsx`
- Alterar `DialogContent` para `max-h-[90vh]` com `min-h-0`
- Garantir que o grid de duas colunas tenha `min-h-0` e `overflow-y-auto` como fallback

---

## 2. Novo Lancamento no Modal com mesmas opcoes do lancamento normal

**Problema:** O dialog "Novo Lancamento" dentro do modal do colaborador tem apenas Tipo, Descricao, Valor e Fixo. Faltam: mes/ano, parcelamento.

**Solucao:**
- Arquivo: `src/components/collaborators/CollaboratorModal.tsx`
- Adicionar ao `entryForm` state: `month`, `year`, `is_installment`, `installment_count`
- No dialog, adicionar seletores de Mes/Ano, Switch de Parcelamento e campo de numero de parcelas
- Atualizar logica de criacao para suportar parcelas com meses incrementais e descricao com sufixo (1/N), (2/N)

---

## 3. Relatorio de Folha separado por colaborador

**Problema:** Os totais somam tudo junto sem separar por colaborador.

**Solucao:**
- Arquivo: `src/pages/dashboard/RelatoriosPage.tsx`
- Para cada colaborador, mostrar linha de rodape com: Total Proventos, Total Descontos, Liquido, FGTS
- Adicionar card de "Total Geral" no final com soma de todos os colaboradores
- Ajustar `AccordionTrigger` para mostrar liquido (proventos - descontos)

---

## 4. Erro no cadastro de usuario em Configuracoes (Edge Function 409)

**Problema:** O `create-collaborator-user` retorna 409 quando o email ja existe.

**Solucao:**
- Arquivo: `supabase/functions/create-collaborator-user/index.ts`
  - Antes de criar, buscar usuario existente com `listUsers`
  - Se existir, vincular a empresa (inserir em `company_users`) em vez de retornar erro
  - So retornar erro se ja estiver vinculado a mesma empresa
- Arquivo: `src/components/dashboard/UsersAccessTab.tsx`
  - Melhorar tratamento de erro para mensagens mais claras

---

## 5. Logomarca da Empresa em Configuracoes e PDFs (NOVO)

**Problema:** Nao existe funcionalidade para cadastrar logomarca da empresa, e os relatorios PDF nao incluem logo.

**Solucao em 3 partes:**

### 5a. Criar bucket de storage e coluna no banco

- Criar bucket `company-logos` (publico) para armazenar as imagens
- Adicionar coluna `logo_url` (text, nullable) na tabela `companies`
- Criar politicas RLS para o bucket: usuarios autenticados da empresa podem fazer upload, qualquer um pode ler (publico)

### 5b. Tela de Configuracoes - Upload de Logomarca

- Arquivo: `src/pages/dashboard/ConfiguracoesPage.tsx`
- Na tab "Dados da Conta", adicionar secao de "Logomarca" com:
  - Preview da imagem atual (se existir)
  - Botao de upload (aceitar PNG, JPG, max 2MB)
  - Botao de remover logo
- Ao fazer upload:
  - Enviar arquivo para `company-logos/{company_id}/logo.png`
  - Obter URL publica
  - Salvar URL na coluna `logo_url` da tabela `companies`

### 5c. Incluir logomarca nos PDFs

- Arquivo: `src/lib/payslipPdfGenerator.ts` (recibo de pagamento)
  - Adicionar campo `logoUrl` opcional em `PayslipData.company`
  - No header do PDF, se `logoUrl` existir, carregar a imagem com `doc.addImage()` no canto esquerdo
  - Ajustar posicao do texto do titulo para acomodar a logo

- Arquivo: `src/lib/exportUtils.ts` (relatorio de folha)
  - Adicionar `logoUrl` opcional em `ExportData`
  - Na funcao `exportToPDF`, se `logoUrl` existir, inserir imagem no header antes do titulo

- Nos componentes que chamam essas funcoes, passar o `logo_url` da empresa como parametro

---

## Detalhes Tecnicos

### Migracao SQL:

```text
1. Criar bucket storage "company-logos" (publico)
2. Politicas RLS para o bucket:
   - SELECT: publico
   - INSERT/UPDATE/DELETE: usuario autenticado que pertence a empresa
3. ALTER TABLE companies ADD COLUMN logo_url TEXT
```

### Fluxo de Upload da Logo:

```text
Usuario clica "Enviar Logo"
  -> Seleciona arquivo (PNG/JPG, max 2MB)
  -> Upload para storage: company-logos/{company_id}/logo.ext
  -> Recebe URL publica
  -> UPDATE companies SET logo_url = url WHERE id = company_id
  -> Preview atualizado na tela
```

### Inclusao nos PDFs:

```text
Para carregar imagem no jsPDF:
  1. Fetch da URL publica da logo
  2. Converter para base64 (via canvas ou fetch blob)
  3. doc.addImage(base64, 'PNG', x, y, width, height)
  4. Logo posicionada no header, tamanho maximo ~25x25mm
```

### Arquivos a modificar:

| Arquivo | Mudanca |
|---------|---------|
| `src/components/collaborators/CollaboratorModal.tsx` | Fix scroll + campos mes/ano/parcelamento |
| `src/pages/dashboard/RelatoriosPage.tsx` | Separar totais por colaborador + total geral |
| `src/components/dashboard/UsersAccessTab.tsx` | Melhorar tratamento erro 409 |
| `supabase/functions/create-collaborator-user/index.ts` | Vincular usuario existente |
| `src/pages/dashboard/ConfiguracoesPage.tsx` | Secao de upload de logomarca |
| `src/lib/payslipPdfGenerator.ts` | Adicionar logo no header do recibo |
| `src/lib/exportUtils.ts` | Adicionar logo no header do relatorio PDF |
| Nova migracao SQL | Bucket + coluna logo_url |
