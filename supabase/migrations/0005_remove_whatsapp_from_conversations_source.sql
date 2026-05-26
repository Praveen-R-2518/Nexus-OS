-- Drop WhatsApp from allowed conversation sources (Gmail-first product scope).

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
    check (source in ('webhook', 'manual', 'gmail', 'email', 'imap'));
end $$;
