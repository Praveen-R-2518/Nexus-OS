-- Meta unified inbox foundation (additive, RLS-safe).
-- Extends conversations.source, external deep-link columns, business_profiles routing keys,
-- and meta_credentials table mirroring gmail_credentials.

-- 1. conversations.source CHECK — add whatsapp, instagram, facebook
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'conversations_source_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations drop constraint conversations_source_check;
  end if;

  alter table public.conversations
    add constraint conversations_source_check
    check (source in ('webhook', 'manual', 'gmail', 'email', 'imap', 'whatsapp', 'instagram', 'facebook'));
end $$;

-- 2. External thread / deep-link columns for "open real inbox"
alter table public.conversations
  add column if not exists external_thread_id text,
  add column if not exists external_permalink text;

comment on column public.conversations.external_thread_id is
  'Platform-native thread or message id (e.g. wa:..., ig:..., fb:...).';

comment on column public.conversations.external_permalink is
  'Deep link URL to open the conversation in the platform native inbox.';

create index if not exists conversations_external_thread_id_idx
  on public.conversations (external_thread_id)
  where external_thread_id is not null;

-- 3. business_profiles Meta routing keys
alter table public.business_profiles
  add column if not exists ig_account_id text,
  add column if not exists fb_page_id text,
  add column if not exists wa_phone_number_id text;

comment on column public.business_profiles.ig_account_id is
  'Instagram business account id for Meta webhook tenant routing. Unique when set.';

comment on column public.business_profiles.fb_page_id is
  'Facebook Page id for Messenger webhook tenant routing. Unique when set.';

comment on column public.business_profiles.wa_phone_number_id is
  'WhatsApp Cloud API phone_number_id for webhook tenant routing. Unique when set.';

create unique index if not exists business_profiles_ig_account_uidx
  on public.business_profiles (trim(ig_account_id))
  where ig_account_id is not null and trim(ig_account_id) <> '';

create unique index if not exists business_profiles_fb_page_uidx
  on public.business_profiles (trim(fb_page_id))
  where fb_page_id is not null and trim(fb_page_id) <> '';

create unique index if not exists business_profiles_wa_phone_number_id_uidx
  on public.business_profiles (trim(wa_phone_number_id))
  where wa_phone_number_id is not null and trim(wa_phone_number_id) <> '';

-- 4. meta_credentials table (mirrors gmail_credentials pattern)
create table if not exists public.meta_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  platform text not null check (platform in ('whatsapp', 'instagram', 'facebook')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'failed')),
  page_id text,
  page_name text,
  ig_account_id text,
  ig_username text,
  wa_phone_number_id text,
  wa_display_phone text,
  access_token_encrypted text,
  token_expiry timestamptz,
  scope text,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_error text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_credentials_workspace_user_platform_uniq
  on public.meta_credentials (workspace_id, user_id, platform)
  where user_id is not null;

create index if not exists meta_credentials_team_id_idx
  on public.meta_credentials (team_id);

create index if not exists meta_credentials_workspace_sync_idx
  on public.meta_credentials (workspace_id, sync_enabled)
  where status = 'connected';

create or replace function public.trg_meta_credentials_set_team_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
  return new;
end;
$$;

drop trigger if exists trg_meta_credentials_set_team_from_workspace on public.meta_credentials;
create trigger trg_meta_credentials_set_team_from_workspace
  before insert or update of workspace_id on public.meta_credentials
  for each row
  execute function public.trg_meta_credentials_set_team_from_workspace();

create or replace function public.handle_meta_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_meta_credentials_updated_at on public.meta_credentials;
create trigger trg_meta_credentials_updated_at
  before update on public.meta_credentials
  for each row
  execute function public.handle_meta_credentials_updated_at();

alter table public.meta_credentials enable row level security;

drop policy if exists "meta_credentials_select_team" on public.meta_credentials;
drop policy if exists "meta_credentials_manage_owner" on public.meta_credentials;

create policy "meta_credentials_select_team" on public.meta_credentials
  for select to authenticated
  using (team_id = (select private.current_team_id()) or public.is_workspace_owner(workspace_id));

create policy "meta_credentials_manage_owner" on public.meta_credentials
  for all to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

grant select, insert, update, delete on table public.meta_credentials to authenticated;
