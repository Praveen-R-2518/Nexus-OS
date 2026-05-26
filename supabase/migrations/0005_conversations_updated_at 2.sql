-- conversations.updated_at is required by PATCH /api/approval and dashboard types.

alter table public.conversations
  add column if not exists updated_at timestamptz not null default now();

update public.conversations
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;
