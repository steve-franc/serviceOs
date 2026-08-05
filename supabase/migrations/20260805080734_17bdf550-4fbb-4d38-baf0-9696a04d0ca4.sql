CREATE POLICY "Bill files readable by restaurant staff"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bill-files'
  AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships rm
    WHERE rm.user_id = auth.uid()
      AND rm.restaurant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Bill files uploadable by restaurant staff"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bill-files'
  AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships rm
    WHERE rm.user_id = auth.uid()
      AND rm.restaurant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Bill files updatable by restaurant staff"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'bill-files'
  AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships rm
    WHERE rm.user_id = auth.uid()
      AND rm.restaurant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Bill files deletable by restaurant staff"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'bill-files'
  AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships rm
    WHERE rm.user_id = auth.uid()
      AND rm.restaurant_id::text = (storage.foldername(name))[1]
  )
);