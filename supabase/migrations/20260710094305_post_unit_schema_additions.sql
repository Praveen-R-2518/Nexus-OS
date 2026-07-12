-- Track how a post's media originated, and link to its generation record
ALTER TABLE public.social_posts
  ADD COLUMN source text DEFAULT 'upload' CHECK (source IN ('upload', 'ai_generated'));

-- Enforce a real status lifecycle matching the Approval Gate architecture
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'published', 'failed'));

-- Generation history for AI-created images: enables Undo (walk parent_generation_id)
-- and Edit (new row referencing the one being edited) without relying on client state.
CREATE TABLE public.post_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  post_id uuid REFERENCES public.social_posts(id),
  prompt text NOT NULL,
  image_url text NOT NULL,
  parent_generation_id uuid REFERENCES public.post_generations(id),
  model text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.post_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org isolation" ON public.post_generations
  FOR ALL
  USING (organization_id IN (SELECT user_profiles.organization_id FROM user_profiles WHERE user_profiles.id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT user_profiles.organization_id FROM user_profiles WHERE user_profiles.id = auth.uid()));

-- Link social_posts to the accepted generation, now that post_generations exists
ALTER TABLE public.social_posts
  ADD COLUMN generation_id uuid REFERENCES public.post_generations(id);

-- Brand asset library: logos and brand images the founder re-uses across posts
CREATE TABLE public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  storage_path text NOT NULL,
  name text,
  type text DEFAULT 'logo' CHECK (type IN ('logo', 'brand_image', 'other')),
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org isolation" ON public.brand_assets
  FOR ALL
  USING (organization_id IN (SELECT user_profiles.organization_id FROM user_profiles WHERE user_profiles.id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT user_profiles.organization_id FROM user_profiles WHERE user_profiles.id = auth.uid()));
