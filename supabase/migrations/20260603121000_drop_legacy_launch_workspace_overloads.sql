-- Remove legacy launch_workspace overloads that make named PostgREST RPC calls ambiguous.
-- Canonical signature (keep): launch_workspace(text, text[], text, text, text)
-- Legacy signatures (drop):
--   launch_workspace(text, text, text, text[], text)
--   launch_workspace(text, text, text, text)

drop function if exists public.launch_workspace(text, text, text, text[], text);
drop function if exists public.launch_workspace(text, text, text, text);

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
