-- NexusOS signup schema (run via Supabase CLI or SQL editor)
-- Adds workspace_members INSERT policy required for owner self-insert during signup.

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on new Supabase signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  workspace_type TEXT CHECK (workspace_type IN ('solo', 'team')) NOT NULL,
  industry TEXT,
  company_size TEXT,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Workspace members (team access control)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 4. Subscriptions table (ready for Dodo integration later)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_tier TEXT CHECK (plan_tier IN ('starter', 'pro', 'team', 'enterprise')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  dodo_customer_id TEXT,
  dodo_subscription_id TEXT,
  status TEXT CHECK (status IN ('trial', 'active', 'past_due', 'canceled', 'pending'))
    DEFAULT 'pending',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Gmail credentials table
CREATE TABLE IF NOT EXISTS gmail_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  imap_username TEXT NOT NULL,
  imap_password_encrypted TEXT NOT NULL,
  credential_type TEXT CHECK (credential_type IN ('imap', 'oauth')) DEFAULT 'imap',
  status TEXT CHECK (status IN ('pending', 'connected', 'failed')) DEFAULT 'pending',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profile" ON profiles;
CREATE POLICY "Users manage own profile"
  ON profiles FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "Owners manage workspace" ON workspaces;
CREATE POLICY "Owners manage workspace"
  ON workspaces FOR ALL USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Members view workspace" ON workspaces;
CREATE POLICY "Members view workspace"
  ON workspaces FOR SELECT
  USING (id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Workspace members visible to members" ON workspace_members;
CREATE POLICY "Workspace members visible to members"
  ON workspace_members FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Required for signup: owner inserts their own membership row
DROP POLICY IF EXISTS "Owners insert workspace members" ON workspace_members;
CREATE POLICY "Owners insert workspace members"
  ON workspace_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner views subscription" ON subscriptions;
CREATE POLICY "Owner views subscription"
  ON subscriptions FOR ALL
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Owner manages gmail credentials" ON gmail_credentials;
CREATE POLICY "Owner manages gmail credentials"
  ON gmail_credentials FOR ALL
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
  ));
