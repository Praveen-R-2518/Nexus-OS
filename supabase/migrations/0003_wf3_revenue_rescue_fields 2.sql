-- WF3 - Revenue Rescue Agent strict prompt fields.
--
-- These columns support the exact payloads used by the WF3 n8n workflow.

alter table public.reply_drafts
  add column if not exists approval_status text not null default 'pending',
  add column if not exists sent_at timestamptz;

alter table public.followups
  add column if not exists message text;

alter table public.followups
  alter column action set default 'Follow-up: no response received after reply was sent.';
