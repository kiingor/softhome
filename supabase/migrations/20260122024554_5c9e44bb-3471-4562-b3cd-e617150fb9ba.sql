-- Função auxiliar SECURITY DEFINER para verificar permissões de módulo
-- Usada nas RLS policies para checar se usuário tem permissão específica
CREATE OR REPLACE FUNCTION public.has_module_permission(
  _user_id uuid, 
  _company_id uuid, 
  _module text, 
  _permission text DEFAULT 'can_view'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Company owner (admin) always has all permissions
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM companies 
      WHERE id = _company_id AND owner_id = _user_id
    ) THEN true
    ELSE (
      SELECT CASE _permission
        WHEN 'can_view' THEN COALESCE(can_view, false)
        WHEN 'can_create' THEN COALESCE(can_create, false)
        WHEN 'can_edit' THEN COALESCE(can_edit, false)
        WHEN 'can_delete' THEN COALESCE(can_delete, false)
        ELSE false
      END
      FROM user_permissions
      WHERE user_id = _user_id 
        AND company_id = _company_id 
        AND module = _module
      LIMIT 1
    )
  END
$$;

-- Função auxiliar simplificada que verifica se usuário pode VER um módulo
CREATE OR REPLACE FUNCTION public.can_view_module(_user_id uuid, _company_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_module_permission(_user_id, _company_id, _module, 'can_view')
$$;

-- Função que verifica se usuário pode MODIFICAR (create/edit/delete) em um módulo
CREATE OR REPLACE FUNCTION public.can_modify_module(_user_id uuid, _company_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_module_permission(_user_id, _company_id, _module, 'can_create')
    OR public.has_module_permission(_user_id, _company_id, _module, 'can_edit')
    OR public.has_module_permission(_user_id, _company_id, _module, 'can_delete')
$$;