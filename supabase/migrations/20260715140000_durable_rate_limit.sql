-- Durable, cross-instance rate limiting (launch report item 10).
-- The in-memory limiter in lib/api-security.ts resets on redeploy and is per-instance;
-- sensitive namespaces (api:internal:*, api:auth:*, api:posts:image) now also consult
-- this Postgres counter via the rate_limit_hit RPC (service-role only).

create table if not exists private.rate_limit_counters (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

revoke all on table private.rate_limit_counters from public, anon, authenticated;

-- Fixed-window counter. Lives in public so the service-role PostgREST client can call it
-- (the private schema is not API-exposed), but EXECUTE is service_role-only.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_reset timestamptz;
begin
  insert into private.rate_limit_counters as c (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when c.reset_at <= v_now then 1 else c.count + 1 end,
        reset_at = case
          when c.reset_at <= v_now then v_now + make_interval(secs => p_window_ms / 1000.0)
          else c.reset_at
        end
  returning count, reset_at into v_count, v_reset;

  -- Opportunistic cleanup of long-expired windows (~1% of calls).
  if random() < 0.01 then
    delete from private.rate_limit_counters
    where reset_at < v_now - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_count <= p_max,
    'remaining', greatest(p_max - v_count, 0),
    'reset_at', v_reset
  );
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
