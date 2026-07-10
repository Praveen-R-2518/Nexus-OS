-- invite_preview: safe, unauthenticated lookup for the signup page.
--
-- An anonymous visitor landing on /signup?invite=<token> is not a member of the
-- inviting organization, so RLS on public.invites correctly hides the row from
-- them. This SECURITY DEFINER function exposes ONLY the organization name and a
-- coarse status for a given token — nothing else about the invite (not the
-- invitee email, role, or who invited them). It lets the signup form show
-- "You're joining {org}" and pre-warn on expired/accepted invites before the
-- auth.users trigger silently falls through to creating a brand-new org.

create or replace function public.invite_preview(p_token uuid)
returns table (organization_name text, status text)
language sql
security definer
stable
set search_path = public
as $$
  select
    o.name as organization_name,
    case
      when i.status = 'accepted' then 'accepted'
      when i.status = 'expired' then 'expired'
      when i.expires_at is not null and i.expires_at < now() then 'expired'
      else 'pending'
    end as status
  from public.invites i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token
  limit 1;
$$;

-- Only expose the narrow accessor; nothing inherits broad table access here.
revoke all on function public.invite_preview(uuid) from public;
grant execute on function public.invite_preview(uuid) to anon, authenticated;

comment on function public.invite_preview(uuid) is
  'Public token->{organization_name,status} lookup for signup invite links. Exposes no other invite fields.';
