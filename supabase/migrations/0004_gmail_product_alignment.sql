-- Gmail-first product alignment for Nexus OS.
--
-- Keeps the existing table scope intact while aligning the live n8n payloads,
-- dashboard queries, and buildathon demo assertions.

alter table public.workflow_logs
  add column if not exists created_at timestamptz not null default now();

update public.workflow_logs
set created_at = coalesce(created_at, "timestamp", now())
where created_at is null;

alter table public.reply_drafts
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists status text not null default 'pending_approval',
  add column if not exists approval_status text not null default 'pending',
  add column if not exists sent_at timestamptz;

update public.reply_drafts
set approval_status = case
  when approval_status is null or approval_status = '' then 'pending'
  else approval_status
end;

alter table public.followups
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists action text,
  add column if not exists message text;

alter table public.followups
  alter column status set default 'pending',
  alter column action set default 'Follow-up: no response received after reply was sent.';

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
    check (source in ('demo', 'webhook', 'manual', 'gmail', 'email', 'imap', 'whatsapp'));
end $$;

alter table public.daily_reports
  add column if not exists date date default current_date,
  add column if not exists revenue_at_risk numeric not null default 0,
  add column if not exists hot_leads_count integer not null default 0,
  add column if not exists churn_risks_count integer not null default 0,
  add column if not exists replies_drafted integer not null default 0,
  add column if not exists followups_scheduled integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_reports'
      and column_name = 'summary'
      and data_type = 'jsonb'
  ) then
    alter table public.daily_reports
      alter column summary drop default;

    alter table public.daily_reports
      alter column summary type text
      using case
        when jsonb_typeof(summary) = 'string' then trim(both '"' from summary::text)
        else summary::text
      end;
  end if;
end $$;

alter table public.daily_reports
  alter column summary set default '',
  alter column summary set not null;

update public.daily_reports
set date = coalesce(date, report_date, current_date)
where date is null;

create index if not exists conversations_created_at_idx
  on public.conversations (created_at desc);

create index if not exists conversations_source_created_at_idx
  on public.conversations (source, created_at desc);

create index if not exists leads_status_updated_at_idx
  on public.leads (status, updated_at desc);

create index if not exists reply_drafts_approval_created_at_idx
  on public.reply_drafts (approval_status, created_at desc);

create index if not exists followups_status_scheduled_for_idx
  on public.followups (status, scheduled_for);

create index if not exists workflow_logs_timestamp_idx
  on public.workflow_logs ("timestamp" desc);

create index if not exists daily_reports_date_idx
  on public.daily_reports (date desc);
