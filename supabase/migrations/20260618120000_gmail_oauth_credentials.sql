-- Gmail OAuth2 credential storage (additive).
-- Extends existing gmail_credentials for OAuth; IMAP columns remain for backward compatibility.

alter table public.gmail_credentials
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists access_token_encrypted text,
  add column if not exists refresh_token_encrypted text not null default '',
  add column if not exists token_expiry timestamptz,
  add column if not exists scope text,
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_error text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists gmail_credentials_workspace_user_uniq
  on public.gmail_credentials (workspace_id, user_id)
  where user_id is not null;

create index if not exists gmail_credentials_workspace_sync_idx
  on public.gmail_credentials (workspace_id, sync_enabled)
  where credential_type = 'oauth';

create or replace function public.handle_gmail_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gmail_credentials_updated_at on public.gmail_credentials;
create trigger trg_gmail_credentials_updated_at
  before update on public.gmail_credentials
  for each row
  execute function public.handle_gmail_credentials_updated_at();
