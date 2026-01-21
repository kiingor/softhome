-- Inserir configuração da imagem do hero
INSERT INTO system_settings (setting_key, setting_value)
VALUES ('hero_image_url', '')
ON CONFLICT (setting_key) DO NOTHING;

-- Criar bucket para assets da landing page
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-assets', 'landing-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Política: Todos podem visualizar (público)
CREATE POLICY "Anyone can view landing assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'landing-assets');

-- Política: Master admins podem fazer upload
CREATE POLICY "Master admins can upload landing assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'landing-assets' AND is_master_admin(auth.uid()));

-- Política: Master admins podem atualizar
CREATE POLICY "Master admins can update landing assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'landing-assets' AND is_master_admin(auth.uid()));

-- Política: Master admins podem deletar
CREATE POLICY "Master admins can delete landing assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'landing-assets' AND is_master_admin(auth.uid()));