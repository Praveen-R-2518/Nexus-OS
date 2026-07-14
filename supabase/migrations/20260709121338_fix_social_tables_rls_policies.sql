
-- Drop the broken policies (organization_id compared directly to auth.uid())
DROP POLICY IF EXISTS "org isolation" ON social_posts;
DROP POLICY IF EXISTS "org isolation" ON social_credentials;

-- Correct pattern: match via user_profiles, consistent with rest of NexusOS
CREATE POLICY "org isolation" ON social_posts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org isolation" ON social_credentials
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );
