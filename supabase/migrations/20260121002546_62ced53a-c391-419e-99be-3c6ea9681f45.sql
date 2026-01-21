-- Create storage bucket for master images
INSERT INTO storage.buckets (id, name, public)
VALUES ('master-images', 'master-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow master admins to upload images
CREATE POLICY "Master admins can upload images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'master-images' 
  AND is_master_admin(auth.uid())
);

-- RLS: Allow master admins to update their images
CREATE POLICY "Master admins can update images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'master-images' 
  AND is_master_admin(auth.uid())
);

-- RLS: Allow master admins to delete images
CREATE POLICY "Master admins can delete images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'master-images' 
  AND is_master_admin(auth.uid())
);

-- RLS: Anyone can view master images (public bucket)
CREATE POLICY "Anyone can view master images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'master-images');