-- Criar tabela para configurações do sistema
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (para aplicar o tema em todo lugar)
CREATE POLICY "Anyone can read system settings"
ON public.system_settings
FOR SELECT
USING (true);

-- Política de escrita apenas para master admins
CREATE POLICY "Master admins can manage settings"
ON public.system_settings
FOR ALL
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

-- Inserir configuração padrão da cor primária (laranja atual)
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('primary_color', '24 95% 53%');