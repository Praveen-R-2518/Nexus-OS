-- Standalone: signup email status RPC (also in 20260527120000; safe if already applied).
create or replace function public.check_signup_email_status(email_input text)
returns text
language sql
stable
security definer
set search_path = auth, public
as $$
  select case
    when exists (
      select 1
      from auth.users u
      where lower(btrim(u.email::text)) = lower(btrim(email_input))
        and u.email_confirmed_at is not null
    ) then 'confirmed'
    when exists (
      select 1
      from auth.users u
      where lower(btrim(u.email::text)) = lower(btrim(email_input))
        and u.email_confirmed_at is null
    ) then 'pending_verification'
    else 'available'
  end;
$$;

comment on function public.check_signup_email_status(text) is
  'available | pending_verification | confirmed. service_role only.';

revoke all on function public.check_signup_email_status(text) from public;
grant execute on function public.check_signup_email_status(text) to service_role;
