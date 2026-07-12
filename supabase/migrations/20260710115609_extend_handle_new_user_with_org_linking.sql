CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by uuid,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org isolation" ON public.invites
  FOR ALL
  USING (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.user_profiles WHERE id = auth.uid()));

-- Extends the EXISTING handle_new_user() trigger function (already wired to auth.users
-- via the pre-existing on_auth_user_created trigger). Original profiles insert preserved
-- unchanged; organization/user_profiles linking added alongside it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_invite record;
  v_org_id uuid;
  v_org_name text;
begin
  -- Original behavior: unchanged
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '')
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();

  -- New: link this user to an organization
  if new.raw_user_meta_data ? 'invite_token' then
    select * into v_invite
    from public.invites
    where token = (new.raw_user_meta_data ->> 'invite_token')::uuid
      and status = 'pending'
      and expires_at > now()
    limit 1;
  end if;

  if v_invite.id is not null then
    insert into public.user_profiles (id, organization_id, email, role)
    values (new.id, v_invite.organization_id, new.email, v_invite.role)
    on conflict (id) do nothing;

    update public.invites set status = 'accepted' where id = v_invite.id;
  else
    v_org_name := coalesce(
      nullif(new.raw_user_meta_data ->> 'org_name', ''),
      split_part(new.email, '@', 1) || E'\u2019s Organization'
    );

    insert into public.organizations (name)
    values (v_org_name)
    returning id into v_org_id;

    insert into public.user_profiles (id, organization_id, email, role)
    values (new.id, v_org_id, new.email, 'owner')
    on conflict (id) do nothing;
  end if;

  return new;
end;
$function$;
