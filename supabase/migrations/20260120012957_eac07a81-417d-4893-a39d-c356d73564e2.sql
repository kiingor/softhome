-- Create closed_periods table for payroll closing
CREATE TABLE public.closed_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  closed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, year, company_id)
);

-- Enable RLS
ALTER TABLE public.closed_periods ENABLE ROW LEVEL SECURITY;

-- RLS policies for closed_periods
CREATE POLICY "Admin and RH can manage closed periods"
  ON public.closed_periods
  FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
    AND user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
    AND user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "Users can view company closed periods"
  ON public.closed_periods
  FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

-- Create index
CREATE INDEX idx_closed_periods_company ON public.closed_periods(company_id, year, month);