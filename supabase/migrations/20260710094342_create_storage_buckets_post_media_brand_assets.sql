-- Post media: uploaded or AI-generated images/video for social posts
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', false);

-- Brand assets: logos and reusable brand images
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false);

-- Path convention: {organization_id}/{filename} — first folder segment is the org id.
CREATE POLICY "org isolation select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN ('post-media', 'brand-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org isolation insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id IN ('post-media', 'brand-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org isolation update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id IN ('post-media', 'brand-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org isolation delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id IN ('post-media', 'brand-assets')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );
