
-- Add image_url column to menu_items
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image_url text;

-- Create public storage bucket for dish photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('dish-photos', 'dish-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for dish-photos bucket
CREATE POLICY "Public can view dish photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'dish-photos');

CREATE POLICY "Authenticated users can upload dish photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dish-photos');

CREATE POLICY "Authenticated users can update dish photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'dish-photos');

CREATE POLICY "Authenticated users can delete dish photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'dish-photos');
