-- ============================================
-- MIGRAR RLS POLICIES PARA USAR user_permissions
-- ============================================

-- =========== COLLABORATORS ===========
-- Drop old policies
DROP POLICY IF EXISTS "Admin and RH can view all collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admin and RH can insert collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admin and RH can update collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Admin and RH can delete collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Gestor can view store collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Gestor can insert store collaborators" ON public.collaborators;
DROP POLICY IF EXISTS "Gestor can update store collaborators" ON public.collaborators;

-- Create new permission-based policies
CREATE POLICY "Users with permission can view collaborators" 
ON public.collaborators FOR SELECT 
USING (
  can_view_module(auth.uid(), company_id, 'colaboradores')
  OR user_id = auth.uid()
  OR is_master_admin(auth.uid())
);

CREATE POLICY "Users with permission can insert collaborators" 
ON public.collaborators FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_create')
);

CREATE POLICY "Users with permission can update collaborators" 
ON public.collaborators FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_edit')
  OR (user_id = auth.uid() AND lower(email) = lower((auth.jwt() ->> 'email'::text)))
);

CREATE POLICY "Users with permission can delete collaborators" 
ON public.collaborators FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'colaboradores', 'can_delete')
);

-- =========== TEAMS (Setores) ===========
DROP POLICY IF EXISTS "Admin and RH can insert teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can update teams" ON public.teams;
DROP POLICY IF EXISTS "Admin and RH can delete teams" ON public.teams;

CREATE POLICY "Users with permission can insert teams" 
ON public.teams FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'setores', 'can_create')
);

CREATE POLICY "Users with permission can update teams" 
ON public.teams FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'setores', 'can_edit')
);

CREATE POLICY "Users with permission can delete teams" 
ON public.teams FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'setores', 'can_delete')
);

-- =========== POSITIONS (Cargos) ===========
DROP POLICY IF EXISTS "Admin and RH can manage positions" ON public.positions;

CREATE POLICY "Users with permission can insert positions" 
ON public.positions FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'cargos', 'can_create')
);

CREATE POLICY "Users with permission can update positions" 
ON public.positions FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'cargos', 'can_edit')
);

CREATE POLICY "Users with permission can delete positions" 
ON public.positions FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'cargos', 'can_delete')
);

-- =========== BENEFITS (Benefícios) ===========
DROP POLICY IF EXISTS "Admin and RH can manage benefits" ON public.benefits;

CREATE POLICY "Users with permission can insert benefits" 
ON public.benefits FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'beneficios', 'can_create')
);

CREATE POLICY "Users with permission can update benefits" 
ON public.benefits FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'beneficios', 'can_edit')
);

CREATE POLICY "Users with permission can delete benefits" 
ON public.benefits FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'beneficios', 'can_delete')
);

-- =========== BENEFITS_ASSIGNMENTS ===========
DROP POLICY IF EXISTS "Admin and RH can manage assignments" ON public.benefits_assignments;

CREATE POLICY "Users with permission can manage assignments" 
ON public.benefits_assignments FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM benefits b
    WHERE b.id = benefits_assignments.benefit_id
    AND has_module_permission(auth.uid(), b.company_id, 'beneficios', 'can_edit')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM benefits b
    WHERE b.id = benefits_assignments.benefit_id
    AND has_module_permission(auth.uid(), b.company_id, 'beneficios', 'can_create')
  )
);

-- =========== PAYROLL_ENTRIES (Financeiro) ===========
DROP POLICY IF EXISTS "Admin and RH can view payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Admin and RH can insert payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Admin and RH can update payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Admin and RH can delete payroll entries" ON public.payroll_entries;

CREATE POLICY "Users with permission can view payroll entries" 
ON public.payroll_entries FOR SELECT 
USING (
  can_view_module(auth.uid(), company_id, 'financeiro')
  OR EXISTS (
    SELECT 1 FROM collaborators c
    WHERE c.id = payroll_entries.collaborator_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users with permission can insert payroll entries" 
ON public.payroll_entries FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'financeiro', 'can_create')
);

CREATE POLICY "Users with permission can update payroll entries" 
ON public.payroll_entries FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'financeiro', 'can_edit')
);

CREATE POLICY "Users with permission can delete payroll entries" 
ON public.payroll_entries FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'financeiro', 'can_delete')
);

-- =========== PAYSLIPS (Contabilidade) ===========
DROP POLICY IF EXISTS "Admin and RH can manage payslips" ON public.payslips;

CREATE POLICY "Users with permission can view payslips" 
ON public.payslips FOR SELECT 
USING (
  can_view_module(auth.uid(), company_id, 'contabilidade')
  OR EXISTS (
    SELECT 1 FROM collaborators c
    WHERE c.id = payslips.collaborator_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "Users with permission can insert payslips" 
ON public.payslips FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'contabilidade', 'can_create')
);

CREATE POLICY "Users with permission can update payslips" 
ON public.payslips FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'contabilidade', 'can_edit')
);

CREATE POLICY "Users with permission can delete payslips" 
ON public.payslips FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'contabilidade', 'can_delete')
);

-- =========== CLOSED_PERIODS ===========
DROP POLICY IF EXISTS "Admin and RH can manage closed periods" ON public.closed_periods;

CREATE POLICY "Users with permission can manage closed periods" 
ON public.closed_periods FOR ALL 
USING (
  has_module_permission(auth.uid(), company_id, 'financeiro', 'can_edit')
)
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'financeiro', 'can_create')
);

-- =========== STORES (Empresas) ===========
DROP POLICY IF EXISTS "Admins can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can update stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;

CREATE POLICY "Users with permission can insert stores" 
ON public.stores FOR INSERT 
WITH CHECK (
  has_module_permission(auth.uid(), company_id, 'empresas', 'can_create')
);

CREATE POLICY "Users with permission can update stores" 
ON public.stores FOR UPDATE 
USING (
  has_module_permission(auth.uid(), company_id, 'empresas', 'can_edit')
);

CREATE POLICY "Users with permission can delete stores" 
ON public.stores FOR DELETE 
USING (
  has_module_permission(auth.uid(), company_id, 'empresas', 'can_delete')
);