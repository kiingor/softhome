-- Adicionar política para usuários da empresa poderem ver a empresa
-- (necessário para o hook useSidebarPermissions e validações funcionarem)
CREATE POLICY "Company users can view their company" 
ON public.companies FOR SELECT 
USING (
  user_belongs_to_company(auth.uid(), id)
);

-- Adicionar política para usuários da empresa poderem ver o perfil da empresa
-- (necessário para o DashboardContext carregar dados)
CREATE POLICY "Company users can view company profiles" 
ON public.profiles FOR SELECT 
USING (
  user_belongs_to_company(auth.uid(), company_id)
  OR auth.uid() = user_id
  OR is_master_admin(auth.uid())
);

-- Remover a política antiga de "Users can view their own profile" que está duplicando
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;