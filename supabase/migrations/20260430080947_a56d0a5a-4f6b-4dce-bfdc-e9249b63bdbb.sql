-- Add logo_url column to restaurant_settings
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Create public storage bucket for restaurant logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-logos', 'restaurant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public can view, managers can upload/update/delete logos for their restaurant
-- Files stored under: {restaurant_id}/{filename}
CREATE POLICY "Public can view restaurant logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'restaurant-logos');

CREATE POLICY "Managers can upload restaurant logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'restaurant-logos'
  AND auth.uid() IS NOT NULL
  AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Managers can update restaurant logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'restaurant-logos'
  AND auth.uid() IS NOT NULL
  AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Managers can delete restaurant logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'restaurant-logos'
  AND auth.uid() IS NOT NULL
  AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
