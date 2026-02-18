
-- WhatsApp instances per company
CREATE TABLE public.whatsapp_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  instance_id text,
  status text NOT NULL DEFAULT 'close',
  phone_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage whatsapp instances"
  ON public.whatsapp_instances FOR ALL
  USING (is_company_admin(auth.uid(), company_id))
  WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company users can view whatsapp instances"
  ON public.whatsapp_instances FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

-- Notification templates
CREATE TABLE public.notification_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  message_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, event_type)
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage notification templates"
  ON public.notification_templates FOR ALL
  USING (is_company_admin(auth.uid(), company_id))
  WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company users can view notification templates"
  ON public.notification_templates FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

-- Notification logs
CREATE TABLE public.notification_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  phone_number text,
  message_sent text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view notification logs"
  ON public.notification_logs FOR SELECT
  USING (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can insert notification logs"
  ON public.notification_logs FOR INSERT
  WITH CHECK (is_company_admin(auth.uid(), company_id));

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
