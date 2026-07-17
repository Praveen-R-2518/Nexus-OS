-- n8n auth hardening: service-role RPCs for issuing/consuming short-lived scoped job tokens
-- (private.n8n_job_tokens, migration 20260717130000) and for atomically claiming the next
-- queued outbound_jobs row. PostgREST does not expose the `private` schema, so the app talks
-- to these tables only through SECURITY DEFINER wrappers in `public`, service_role-only —
-- same pattern as `public.rate_limit_hit` (20260715140000) and
-- `public.claim_stuck_inbound_events` (20260717130000).

create or replace function public.issue_n8n_job_token(
  p_token_hash bytea,
  p_action text,
  p_team_id uuid default null,
  p_workspace_id uuid default null,
  p_organization_id uuid default null,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
declare
  v_id uuid;
  v_expires timestamptz := coalesce(p_expires_at, now() + interval '15 minutes');
begin
  if p_token_hash is null or p_action is null or length(trim(p_action)) = 0 then
    raise exception 'issue_n8n_job_token: p_token_hash and p_action are required';
  end if;

  insert into private.n8n_job_tokens
    (token_hash, action, team_id, workspace_id, organization_id, resource_type, resource_id, expires_at)
  values
    (p_token_hash, p_action, p_team_id, p_workspace_id, p_organization_id, p_resource_type, p_resource_id, v_expires)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.issue_n8n_job_token(
  bytea, text, uuid, uuid, uuid, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.issue_n8n_job_token(
  bytea, text, uuid, uuid, uuid, text, uuid, timestamptz
) to service_role;

comment on function public.issue_n8n_job_token(bytea, text, uuid, uuid, uuid, text, uuid, timestamptz) is
  'Issues a single-use, short-lived n8n job token bound to (action, team/workspace/organization, resource). Service-role only. Caller hashes the plaintext token before calling; only the hash is ever stored.';

-- Atomically validates + burns a job token: single-use (`used_at is null`), not expired,
-- action match, and any supplied binding (team/workspace/resource) must match the row that was
-- stamped at issue time. A caller-supplied binding of NULL means "don't check that column" —
-- but a mismatch (including a stored NULL where a binding is required) fails closed.
create or replace function public.consume_n8n_job_token(
  p_token_hash bytea,
  p_action text,
  p_team_id uuid default null,
  p_workspace_id uuid default null,
  p_resource_type text default null,
  p_resource_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
declare
  v_row private.n8n_job_tokens;
begin
  update private.n8n_job_tokens t
  set used_at = now()
  where t.token_hash = p_token_hash
    and t.used_at is null
    and t.expires_at > now()
    and t.action = p_action
    and (p_team_id is null or t.team_id = p_team_id)
    and (p_workspace_id is null or t.workspace_id = p_workspace_id)
    and (p_resource_type is null or t.resource_type = p_resource_type)
    and (p_resource_id is null or t.resource_id = p_resource_id)
  returning t.* into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'action', v_row.action,
    'team_id', v_row.team_id,
    'workspace_id', v_row.workspace_id,
    'organization_id', v_row.organization_id,
    'resource_type', v_row.resource_type,
    'resource_id', v_row.resource_id,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all on function public.consume_n8n_job_token(
  bytea, text, uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.consume_n8n_job_token(
  bytea, text, uuid, uuid, text, uuid
) to service_role;

comment on function public.consume_n8n_job_token(bytea, text, uuid, uuid, text, uuid) is
  'Validates + single-use-burns an n8n job token. Returns {ok:false} on any mismatch/expiry/reuse instead of raising, so callers fail closed with a generic 401. Service-role only.';

-- Claim the next queued outbound_jobs row (public.outbound_jobs, 20260717130000) for the n8n
-- outbound-jobs worker, mirroring public.claim_stuck_inbound_events's for-update-skip-locked shape
-- so overlapping pollers never double-claim the same row.
create or replace function public.claim_next_outbound_job()
returns setof public.outbound_jobs
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.outbound_jobs j
  set status = 'claiming', claimed_at = now(), updated_at = now()
  where j.id = (
    select o.id
    from public.outbound_jobs o
    where o.status = 'queued'
    order by o.created_at asc
    for update skip locked
    limit 1
  )
  returning j.*;
$$;

revoke all on function public.claim_next_outbound_job() from public, anon, authenticated;
grant execute on function public.claim_next_outbound_job() to service_role;

comment on function public.claim_next_outbound_job() is
  'Atomically claims (queued -> claiming) the oldest queued outbound_jobs row for the n8n outbound worker. Service-role only.';
