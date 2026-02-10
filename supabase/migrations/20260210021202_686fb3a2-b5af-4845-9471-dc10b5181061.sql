
-- Create vacation_periods table
CREATE TABLE public.vacation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_entitled integer NOT NULL DEFAULT 30,
  days_taken integer NOT NULL DEFAULT 0,
  days_sold integer NOT NULL DEFAULT 0,
  days_remaining integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vacation_periods ENABLE ROW LEVEL SECURITY;

-- Create vacation_requests table
CREATE TABLE public.vacation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vacation_period_id uuid NOT NULL REFERENCES public.vacation_periods(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count integer NOT NULL,
  sell_days integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;

-- RLS for vacation_periods
CREATE POLICY "Users with permission can view vacation periods"
  ON public.vacation_periods FOR SELECT
  USING (
    can_view_module(auth.uid(), company_id, 'ferias'::text)
    OR EXISTS (SELECT 1 FROM collaborators c WHERE c.id = vacation_periods.collaborator_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users with permission can insert vacation periods"
  ON public.vacation_periods FOR INSERT
  WITH CHECK (has_module_permission(auth.uid(), company_id, 'ferias'::text, 'can_create'::text));

CREATE POLICY "Users with permission can update vacation periods"
  ON public.vacation_periods FOR UPDATE
  USING (has_module_permission(auth.uid(), company_id, 'ferias'::text, 'can_edit'::text));

CREATE POLICY "Users with permission can delete vacation periods"
  ON public.vacation_periods FOR DELETE
  USING (has_module_permission(auth.uid(), company_id, 'ferias'::text, 'can_delete'::text));

-- RLS for vacation_requests
CREATE POLICY "Users with permission can view vacation requests"
  ON public.vacation_requests FOR SELECT
  USING (
    can_view_module(auth.uid(), company_id, 'ferias'::text)
    OR EXISTS (SELECT 1 FROM collaborators c WHERE c.id = vacation_requests.collaborator_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users with permission can insert vacation requests"
  ON public.vacation_requests FOR INSERT
  WITH CHECK (
    has_module_permission(auth.uid(), company_id, 'ferias'::text, 'can_create'::text)
    OR EXISTS (SELECT 1 FROM collaborators c WHERE c.id = vacation_requests.collaborator_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Users with permission can update vacation requests"
  ON public.vacation_requests FOR UPDATE
  USING (has_module_permission(auth.uid(), company_id, 'ferias'::text, 'can_edit'::text));

CREATE POLICY "Users with permission can delete vacation requests"
  ON public.vacation_requests FOR DELETE
  USING (has_module_permission(auth.uid(), company_id, 'ferias'::text, 'can_delete'::text));

-- Function to generate vacation periods for a collaborator
CREATE OR REPLACE FUNCTION public.generate_vacation_periods(_collaborator_id uuid, _company_id uuid, _admission_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period_start date;
  period_end date;
  period_status text;
BEGIN
  period_start := _admission_date;
  
  WHILE period_start < CURRENT_DATE LOOP
    period_end := period_start + INTERVAL '12 months' - INTERVAL '1 day';
    
    -- Determine status
    IF period_end > CURRENT_DATE THEN
      period_status := 'pending'; -- Still acquiring
    ELSIF period_end + INTERVAL '12 months' < CURRENT_DATE THEN
      period_status := 'expired'; -- Concessive period expired
    ELSE
      period_status := 'available';
    END IF;
    
    -- Insert if not exists
    INSERT INTO vacation_periods (collaborator_id, company_id, start_date, end_date, status)
    VALUES (_collaborator_id, _company_id, period_start, period_end, period_status)
    ON CONFLICT DO NOTHING;
    
    period_start := period_start + INTERVAL '12 months';
  END LOOP;
END;
$$;

-- Trigger to auto-generate vacation periods when admission_date is set
CREATE OR REPLACE FUNCTION public.auto_generate_vacation_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admission_date IS NOT NULL AND (OLD.admission_date IS NULL OR OLD.admission_date != NEW.admission_date) THEN
    -- Delete existing periods (regenerate)
    DELETE FROM vacation_periods WHERE collaborator_id = NEW.id;
    -- Generate new periods
    PERFORM generate_vacation_periods(NEW.id, NEW.company_id, NEW.admission_date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_generate_vacation_periods
  AFTER INSERT OR UPDATE OF admission_date ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_vacation_periods();

-- Function to update vacation period balance when request is completed
CREATE OR REPLACE FUNCTION public.update_vacation_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE vacation_periods
    SET 
      days_taken = days_taken + NEW.days_count,
      days_sold = days_sold + NEW.sell_days,
      days_remaining = days_entitled - (days_taken + NEW.days_count) - (days_sold + NEW.sell_days),
      status = CASE 
        WHEN days_entitled - (days_taken + NEW.days_count) - (days_sold + NEW.sell_days) <= 0 THEN 'used'
        ELSE 'partially_used'
      END
    WHERE id = NEW.vacation_period_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_vacation_balance
  AFTER UPDATE OF status ON public.vacation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_vacation_balance();

-- Trigger for updated_at on vacation_requests
CREATE TRIGGER update_vacation_requests_updated_at
  BEFORE UPDATE ON public.vacation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for vacation_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.vacation_requests;
