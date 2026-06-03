-- Remove ambiguous launch_workspace overload left by an earlier parameter order.
-- Canonical signature (keep): launch_workspace(text, text[], text, text, text)
-- Stale signature (drop):     launch_workspace(text, text, text, text[], text)
--
-- CREATE OR REPLACE only replaces a function with the same argument type order;
-- reordering parameters creates a second overload and breaks named RPC calls.

drop function if exists public.launch_workspace(text, text, text, text[], text);

-- Fail migration if ambiguous overloads remain.
do $$
declare
  v_count int;
begin
  select count(*)::int
  into v_count
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname = 'launch_workspace';

  if v_count <> 1 then
    raise exception 'launch_workspace: expected 1 overload, found %', v_count;
  end if;

  -- Canonical arg types: text, text[], text, text, text
  if not exists (
    select 1
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'launch_workspace'
      and p.proargtypes::text = '25 1009 25 25 25'
  ) then
    raise exception 'launch_workspace: canonical signature (text, text[], text, text, text) missing';
  end if;
end;
$$;
