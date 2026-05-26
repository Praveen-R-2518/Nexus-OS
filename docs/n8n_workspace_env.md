# n8n and `workspace_id`

Operational rows (`conversations`, `workflow_logs`, etc.) are **workspace-scoped**. Any HTTP flow that writes to Supabase must include the target workspace UUID.

## Supabase REST (WF0a export)

The [`n8n_logic/exports/wf0a_gmail_intake.json`](../n8n_logic/exports/wf0a_gmail_intake.json) workflow adds `workspace_id: $env.NEXUS_WORKSPACE_ID` to conversation and workflow log POST bodies.

In n8n, create an environment variable:

| Name | Value |
|------|--------|
| `NEXUS_WORKSPACE_ID` | UUID of the workspace (from `public.workspaces.id`, same as signup / Gmail credential workspace) |

If this variable is unset, Supabase inserts will fail once `workspace_id` is required by your DB constraints and RLS.

## Next.js internal ingest (`/api/internal/n8n/*`)

These routes require a JSON field `workspace_id` (UUID) and verify it exists in `public.workspaces` before inserting.
