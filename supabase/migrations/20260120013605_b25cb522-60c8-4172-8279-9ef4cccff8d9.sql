-- Create payslips table for storing payslip references
CREATE TABLE public.payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020),
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(collaborator_id, month, year)
);

-- Enable RLS
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

-- RLS policies for payslips
CREATE POLICY "Admin and RH can manage payslips"
  ON public.payslips
  FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
    AND user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
    AND user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "Collaborators can view their own payslips"
  ON public.payslips
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_id
      AND c.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX idx_payslips_collaborator ON public.payslips(collaborator_id);
CREATE INDEX idx_payslips_company ON public.payslips(company_id);
CREATE INDEX idx_payslips_period ON public.payslips(year, month);

-- Storage policy for collaborators downloading their own payslips
CREATE POLICY "Collaborators can download their own payslips"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'payslips'
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'rh')
      OR EXISTS (
        SELECT 1 FROM public.payslips p
        JOIN public.collaborators c ON c.id = p.collaborator_id
        WHERE c.user_id = auth.uid()
        AND p.file_url LIKE '%' || name
      )
    )
  );