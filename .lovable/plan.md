
# Remover campo Status do formulario e definir status automatico

## Problema
O campo "Status" no formulario de cadastro do colaborador permite escolher manualmente entre "Ativo" e "Inativo". Ao cadastrar um novo colaborador, o status fica como "ativo" ao inves de "aguardando_documentacao", quebrando o fluxo de onboarding definido.

## Mudancas

### Arquivo: `src/components/collaborators/CollaboratorForm.tsx`

1. **Remover o campo `status` do schema Zod** - nao sera mais um campo editavel
2. **Remover o campo `status` dos defaultValues do formulario**
3. **Na funcao `onSubmit`**: 
   - Para **novo colaborador**: definir `status: "aguardando_documentacao"` automaticamente
   - Para **edicao**: nao enviar o campo `status` (manter o valor atual no banco, pois o status e controlado pelo fluxo de onboarding/validacao)
4. **Remover o bloco JSX do `<FormField name="status">`** (o Select de Ativo/Inativo) - linhas 347 a 370

### Resultado
- Novo colaborador sempre comeca com `aguardando_documentacao`
- Status so muda via fluxo: primeiro acesso -> validacao_pendente -> ativo/reprovado
- Nenhum usuario consegue alterar o status manualmente pelo formulario
