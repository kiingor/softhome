
-- Add logo_url column to companies
ALTER TABLE public.companies ADD COLUMN logo_url TEXT;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);

-- Public read access
CREATE POLICY "Company logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Company members can upload logos
CREATE POLICY "Company members can upload logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'company-logos'
  AND auth.role() = 'authenticated'
);

-- Company members can update logos
CREATE POLICY "Company members can update logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'company-logos'
  AND auth.role() = 'authenticated'
);

-- Company members can delete logos
CREATE POLICY "Company members can delete logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'company-logos'
  AND auth.role() = 'authenticated'
);
