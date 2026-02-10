-- Create payslips storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for payslips bucket
CREATE POLICY "Users can upload payslips to their company folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payslips'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can view payslips from their company"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payslips'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete payslips"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payslips'
  AND auth.role() = 'authenticated'
);