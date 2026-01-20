-- Create benefits table
CREATE TABLE public.benefits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create benefits_assignments table
CREATE TABLE public.benefits_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  benefit_id UUID NOT NULL REFERENCES public.benefits(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  observation TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(benefit_id, collaborator_id)
);

-- Enable RLS
ALTER TABLE public.benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefits_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for benefits table
CREATE POLICY "Admin and RH can manage benefits"
  ON public.benefits
  FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
    AND user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
    AND user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "Users can view company benefits"
  ON public.benefits
  FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

-- RLS policies for benefits_assignments table
CREATE POLICY "Admin and RH can manage assignments"
  ON public.benefits_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.benefits b
      WHERE b.id = benefit_id
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
      AND user_belongs_to_company(auth.uid(), b.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.benefits b
      WHERE b.id = benefit_id
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'rh'))
      AND user_belongs_to_company(auth.uid(), b.company_id)
    )
  );

CREATE POLICY "Collaborators can view their own assignments"
  ON public.benefits_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
      WHERE c.id = collaborator_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view company assignments"
  ON public.benefits_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.benefits b
      JOIN public.collaborators c ON c.id = collaborator_id
      WHERE b.id = benefit_id
      AND user_belongs_to_company(auth.uid(), b.company_id)
    )
  );

-- Create indexes
CREATE INDEX idx_benefits_company_id ON public.benefits(company_id);
CREATE INDEX idx_benefits_assignments_benefit_id ON public.benefits_assignments(benefit_id);
CREATE INDEX idx_benefits_assignments_collaborator_id ON public.benefits_assignments(collaborator_id);