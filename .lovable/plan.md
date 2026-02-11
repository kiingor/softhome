

# Correcoes no Cadastro do Colaborador

## Problemas Identificados

1. **Campo Status ainda visivel** no `CollaboratorModal.tsx` (linhas 1272-1288) - permite selecionar Ativo/Inativo manualmente
2. **Default status "ativo"** nas linhas 302 e 317 do `CollaboratorModal.tsx` - novos colaboradores ficam ativos em vez de aguardando documentacao
3. **Status enviado na atualizacao** (linha 651) - permite sobrescrever o status do fluxo
4. **Layout da validacao** - atualmente aparece como coluna lateral, deveria ser uma aba separada (Geral + Validacao)
5. **Sinais +/- na tela de Primeiro Acesso** - lancamentos financeiros nao mostram se sao credito ou debito

---

## Mudancas

### Arquivo: `src/components/collaborators/CollaboratorModal.tsx`

**1. Remover campo Status do formulario (linhas 1272-1288)**
- Deletar o bloco do Select de Status
- Manter apenas o campo "Colaborador Avulso" ocupando a largura toda

**2. Corrigir default status para novo colaborador (linha 317)**
- Mudar `status: "ativo"` para `status: "aguardando_documentacao"`

**3. Nao enviar status no handleSave (linha 651)**
- Para novos colaboradores: forcar `status: "aguardando_documentacao"` no saveData
- Para edicao: remover `status` do payload de update (preservar o valor atual no banco)

**4. Reorganizar layout com abas (Geral + Validacao)**
- Substituir o layout de 3 colunas por um sistema de abas
- **Aba "Geral"**: conteudo atual (dados cadastrais na esquerda + financeiro na direita) em 2 colunas
- **Aba "Validacao"**: o componente `CollaboratorValidationTab` ocupando a largura toda
- A aba "Validacao" so aparece quando o status e `validacao_pendente` ou `reprovado`
- Importar `Tabs, TabsList, TabsTrigger, TabsContent` do componente de UI

### Arquivo: `src/pages/colaborador/PrimeiroAcesso.tsx`

**5. Adicionar sinais +/- nos lancamentos financeiros (Step 2)**
- Lancamentos de tipo salario/adicional: prefixo `+` em verde
- Lancamentos de tipo inss/irpf/fgts/custo/despesa/vale: prefixo `-` em vermelho

---

## Detalhes Tecnicos

### Logica do status no handleSave

```text
// Novo colaborador
const saveData = {
  ...campos,
  status: "aguardando_documentacao",
};

// Edicao - omitir status do payload
const { status, ...saveDataWithoutStatus } = saveData;
// usar saveDataWithoutStatus no update
```

### Estrutura de abas no modal

```text
DialogContent
  DialogHeader (titulo)
  Tabs
    TabsList
      TabsTrigger "Geral"
      TabsTrigger "Validacao" (condicional)
    TabsContent "geral"
      grid 2 colunas (dados cadastrais | financeiro)
    TabsContent "validacao"
      CollaboratorValidationTab (largura total)
  Footer (Cancelar | Salvar)
```

### Arquivos impactados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/collaborators/CollaboratorModal.tsx` | Remover status, corrigir default, adicionar abas |
| `src/pages/colaborador/PrimeiroAcesso.tsx` | Sinais +/- nos lancamentos |

