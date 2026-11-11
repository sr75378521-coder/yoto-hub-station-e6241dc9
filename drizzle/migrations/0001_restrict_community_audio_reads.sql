DROP POLICY IF EXISTS "Users read community audio" ON storage.objects;
CREATE POLICY "Users read community audio" ON storage.objects
FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'community-audio' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.public_playlists p
      WHERE p.is_public = true
        AND p.user_id::text = (storage.foldername(name))[1]
        AND p.id::text = (storage.foldername(name))[2]
    )
  )
);