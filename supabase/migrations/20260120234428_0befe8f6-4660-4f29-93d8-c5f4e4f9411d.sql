-- Add image_url column to system_messages for notification images
ALTER TABLE system_messages 
ADD COLUMN IF NOT EXISTS image_url TEXT;