-- Create payroll entry type enum
CREATE TYPE public.payroll_entry_type AS ENUM ('salario', 'vale', 'custo', 'despesa', 'adicional');

-- Create payroll_entries table
CREATE TABLE public.payroll_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type payroll_entry_type NOT NULL,
    description TEXT,
    value DECIMAL(12, 2) NOT NULL CHECK (value > 0),
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
    is_fixed BOOLEAN NOT NULL DEFAULT false,
    collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payroll_entries
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payroll_entries
-- Only Admin and RH can view payroll entries
CREATE POLICY "Admin and RH can view payroll entries"
ON public.payroll_entries
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- Only Admin and RH can insert payroll entries
CREATE POLICY "Admin and RH can insert payroll entries"
ON public.payroll_entries
FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- Only Admin and RH can update payroll entries
CREATE POLICY "Admin and RH can update payroll entries"
ON public.payroll_entries
FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- Only Admin and RH can delete payroll entries
CREATE POLICY "Admin and RH can delete payroll entries"
ON public.payroll_entries
FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'rh'))
  AND public.user_belongs_to_company(auth.uid(), company_id)
);

-- Create index for faster queries
CREATE INDEX idx_payroll_entries_company_month_year ON public.payroll_entries(company_id, year, month);
CREATE INDEX idx_payroll_entries_collaborator ON public.payroll_entries(collaborator_id);

-- Create trigger for updated_at
CREATE TRIGGER update_payroll_entries_updated_at
BEFORE UPDATE ON public.payroll_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();