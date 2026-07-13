# Tenant model unification ADR

> Member 2 · Task 2.6. **Status: ADR written — awaiting human sign-off before any bridge migration.**

## Context

Nexus OS currently runs **two parallel tenant identifiers**:

| Model | Primary keys | Used by |
|---|---|---|
| **Pipeline** | `teams` → `workspaces` → `team_id` / `workspace_id` on rows | `conversations`, `leads`, `reply_drafts`, `followups`, `business_profiles`, `gmail_credentials`, `meta_credentials`, `workflow_logs`, `daily_reports`, n8n WF0a→WF4 |
| **Social / org** | `organizations` → `organization_id` on rows | Social posting (`posts`, brand assets), invites (`lib/invites.ts`), `lib/auth/useOrganization.ts` |

The audit found WF2 conflating these models (`organizations?id=eq.{team_id}` and `leads.organization_id = team_id`). **Member 2 task 2.3 fixed WF2** to use `business_profiles?team_id=eq.…` and stop writing `organization_id` on pipeline `leads`.

Pipeline `leads` (see `0001_initial_schema.sql`) has `team_id` but **no `organization_id` column**. Social tables live in migrations that may exist only on the remote DB until Member 3 completes migration drift sync (checklist 3.1).

## Decision (recommended — pending sign-off)

**Adopt a 1:1 bridge between `teams` and `organizations` in a future additive migration**, not in this task:

1. **Pipeline code path (n8n + intake + sender)** uses only `team_id` / `workspace_id`. Never write `organization_id` from pipeline workflows.
2. **Social code path** continues to use `organization_id` until the bridge exists.
3. **Bridge table or column** (to be implemented after sign-off), e.g.:
   - `teams.organization_id uuid references organizations(id)` nullable, unique where not null, **or**
   - `organization_team_bridge(organization_id, team_id)` with RLS on both sides.
4. **Backfill** once: for each workspace launched via `launch_workspace`, link the auto-created team to the user's organization (if any). Until backfill, social features and pipeline features may show different “tenant” slices for the same human — acceptable short-term.

## Consequences

- WF2/WF3/WF4 and Channel Sender remain on `team_id` only — no further org coupling.
- Social posting (WF8a/b/c) keeps `organization_id` until bridge migration lands.
- Member 3 must sync remote-only social migrations before designing the bridge DDL.
- **No schema rewrite** of existing tables; bridge is additive only.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Collapse org into team (drop `organizations`) | Breaks social tables + invite flows; high blast radius |
| Use `organization_id` everywhere in pipeline | `conversations.team_id` is NOT NULL; would require wide backfill + RLS rewrite |
| Leave dual model forever with no bridge | Confusing for founders; WF2-style bugs recur |

## Open items (human)

- [ ] Sign off on 1:1 bridge approach (this ADR)
- [ ] After Member 3 migration sync: implement bridge migration + backfill script
- [ ] Update `useOrganization` / signup to set bridge on `launch_workspace`

## References

- [`TEAM_BUILD_CHECKLIST.md`](../TEAM_BUILD_CHECKLIST.md) — Member 2 §2.3, Member 3 §3.1
- [`docs/NEXUS_REBUILD_CONTEXT.md`](./NEXUS_REBUILD_CONTEXT.md) — tenant model overview
- [`n8n_logic/tenant_route_resolver.js`](../n8n_logic/tenant_route_resolver.js) — routes via `business_profiles` routing keys
