-- Break RLS recursion between workspaces and workspace_members using SECURITY DEFINER helpers.

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
