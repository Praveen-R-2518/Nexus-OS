-- Fix infinite RLS recursion: workspace_members SELECT policy must not query workspace_members.
-- Superseded for indirect workspaces↔workspace_members cycles by 0008_fix_workspace_rls_helpers.sql.
DROP POLICY IF EXISTS "Workspace members visible to members" ON public.workspace_members;
CREATE POLICY "Workspace members visible to members"
  ON public.workspace_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.owner_user_id = auth.uid()
    )
  );
