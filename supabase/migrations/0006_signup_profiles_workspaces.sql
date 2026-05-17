-- NexusOS signup schema (0006)
-- Profiles, workspaces, workspace_members, subscriptions, gmail_credentials + RLS + grants.
-- Idempotent CREATE IF NOT EXISTS / OR REPLACE. Profile row is created from auth user metadata on signup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
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

-- 3. Workspace members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 4. Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
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

-- 5. Gmail credentials
CREATE TABLE IF NOT EXISTS public.gmail_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  imap_username TEXT NOT NULL,
  imap_password_encrypted TEXT NOT NULL,
  credential_type TEXT CHECK (credential_type IN ('imap', 'oauth')) DEFAULT 'imap',
  status TEXT CHECK (status IN ('pending', 'connected', 'failed')) DEFAULT 'pending',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS helpers: SECURITY DEFINER reads bypass RLS and break workspaces ↔ workspace_members policy cycles.
CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = p_workspace_id
      AND w.owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
CREATE POLICY "Users manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Owners manage workspace" ON public.workspaces;
CREATE POLICY "Owners manage workspace"
  ON public.workspaces FOR ALL
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Members view workspace" ON public.workspaces;
CREATE POLICY "Members view workspace"
  ON public.workspaces FOR SELECT
  USING (public.is_workspace_member(id));

DROP POLICY IF EXISTS "Workspace members visible to members" ON public.workspace_members;
CREATE POLICY "Workspace members visible to members"
  ON public.workspace_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_workspace_owner(workspace_id)
  );

DROP POLICY IF EXISTS "Owners insert workspace members" ON public.workspace_members;
CREATE POLICY "Owners insert workspace members"
  ON public.workspace_members FOR INSERT
  WITH CHECK (public.is_workspace_owner(workspace_id));

DROP POLICY IF EXISTS "Owner views subscription" ON public.subscriptions;
CREATE POLICY "Owner views subscription"
  ON public.subscriptions FOR ALL
  USING (public.is_workspace_owner(workspace_id));

DROP POLICY IF EXISTS "Owner manages gmail credentials" ON public.gmail_credentials;
CREATE POLICY "Owner manages gmail credentials"
  ON public.gmail_credentials FOR ALL
  USING (public.is_workspace_owner(workspace_id));

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_credentials TO authenticated;
