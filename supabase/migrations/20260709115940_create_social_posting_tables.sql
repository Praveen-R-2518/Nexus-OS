CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  user_description TEXT,
  captions JSONB,
  platforms TEXT[],
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org isolation" ON social_posts;
CREATE POLICY "org isolation" ON social_posts
  FOR ALL USING (organization_id = auth.uid()::UUID);

CREATE TABLE IF NOT EXISTS social_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, platform)
);
ALTER TABLE social_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org isolation" ON social_credentials;
CREATE POLICY "org isolation" ON social_credentials
  FOR ALL USING (organization_id = auth.uid()::UUID);
