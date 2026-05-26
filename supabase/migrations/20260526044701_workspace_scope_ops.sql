-- Workspace-scoped operational data (conversations, leads, drafts, logs, reports, profiles).
-- Authenticated dashboard uses RLS + is_workspace_member(workspace_id); n8n keeps service role.

-- 1) Columns -----------------------------------------------------------------
alter table public.conversations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.leads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.reply_drafts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.followups
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.workflow_logs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.daily_reports
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.business_profiles
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create index if not exists conversations_workspace_id_idx on public.conversations (workspace_id);
create index if not exists leads_workspace_id_idx on public.leads (workspace_id);
create index if not exists reply_drafts_workspace_id_idx on public.reply_drafts (workspace_id);
create index if not exists followups_workspace_id_idx on public.followups (workspace_id);
create index if not exists workflow_logs_workspace_id_idx on public.workflow_logs (workspace_id);
create index if not exists daily_reports_workspace_id_idx on public.daily_reports (workspace_id);
create index if not exists business_profiles_workspace_id_idx on public.business_profiles (workspace_id);

-- 2) Denormalize workspace_id from conversation -------------------------------
create or replace function public.sync_workspace_id_from_conversation()
returns trigger
language plpgsql
as $$
declare
  wid uuid;
begin
  if new.conversation_id is not null then
    select c.workspace_id into wid from public.conversations c where c.id = new.conversation_id;
    if wid is not null then
      new.workspace_id := wid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_workspace_from_conversation on public.leads;
create trigger trg_leads_workspace_from_conversation
  before insert or update of conversation_id on public.leads
  for each row execute function public.sync_workspace_id_from_conversation();

drop trigger if exists trg_reply_drafts_workspace_from_conversation on public.reply_drafts;
create trigger trg_reply_drafts_workspace_from_conversation
  before insert or update of conversation_id on public.reply_drafts
  for each row execute function public.sync_workspace_id_from_conversation();

drop trigger if exists trg_followups_workspace_from_conversation on public.followups;
create trigger trg_followups_workspace_from_conversation
  before insert or update of conversation_id on public.followups
  for each row execute function public.sync_workspace_id_from_conversation();

-- 3) Backfill conversations ---------------------------------------------------
update public.conversations c
set workspace_id = (
  select gc.workspace_id
  from public.gmail_credentials gc
  order by gc.created_at asc
  limit 1
)
where c.workspace_id is null
  and exists (select 1 from public.gmail_credentials limit 1);

update public.conversations c
set workspace_id = (
  select w.id from public.workspaces w order by w.created_at asc limit 1
)
where c.workspace_id is null
  and exists (select 1 from public.workspaces limit 1);

-- 4) Backfill child rows from conversations -----------------------------------
update public.leads l
set workspace_id = c.workspace_id
from public.conversations c
where c.id = l.conversation_id
  and l.workspace_id is null
  and c.workspace_id is not null;

update public.reply_drafts rd
set workspace_id = c.workspace_id
from public.conversations c
where c.id = rd.conversation_id
  and rd.workspace_id is null
  and c.workspace_id is not null;

update public.followups f
set workspace_id = c.workspace_id
from public.conversations c
where c.id = f.conversation_id
  and f.workspace_id is null
  and c.workspace_id is not null;

update public.leads l
set workspace_id = (select w.id from public.workspaces w order by w.created_at asc limit 1)
where l.workspace_id is null
  and exists (select 1 from public.workspaces limit 1);

-- 5) Workflow logs & daily reports --------------------------------------------
update public.workflow_logs wl
set workspace_id = (select w.id from public.workspaces w order by w.created_at asc limit 1)
where wl.workspace_id is null
  and exists (select 1 from public.workspaces limit 1);

update public.daily_reports dr
set workspace_id = (select w.id from public.workspaces w order by w.created_at asc limit 1)
where dr.workspace_id is null
  and exists (select 1 from public.workspaces limit 1);

-- 6) business_profiles: one row per workspace ---------------------------------
update public.business_profiles bp
set workspace_id = (select w.id from public.workspaces w order by w.created_at asc limit 1)
where bp.workspace_id is null
  and exists (select 1 from public.workspaces limit 1);

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.business_profiles
  where workspace_id is not null
)
delete from public.business_profiles bp
using ranked r
where bp.id = r.id
  and r.rn > 1;

-- 7) daily_reports: dedupe then per-workspace unique ---------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, coalesce(report_date, current_date)
      order by created_at desc nulls last, id desc
    ) as rn
  from public.daily_reports
  where workspace_id is not null
)
delete from public.daily_reports d
using ranked r
where d.id = r.id
  and r.rn > 1;

alter table public.daily_reports drop constraint if exists daily_reports_report_date_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_reports'::regclass
      and conname = 'daily_reports_workspace_report_date_key'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_workspace_report_date_key
      unique (workspace_id, report_date);
  end if;
end $$;

create unique index if not exists business_profiles_one_per_workspace_uidx
  on public.business_profiles (workspace_id)
  where workspace_id is not null;

-- 8) Drop permissive / legacy policies ----------------------------------------
drop policy if exists "allow_all_business_profiles" on public.business_profiles;
drop policy if exists "allow_all_conversations" on public.conversations;
drop policy if exists "allow_all_leads" on public.leads;
drop policy if exists "allow_all_reply_drafts" on public.reply_drafts;
drop policy if exists "allow_all_followups" on public.followups;
drop policy if exists "allow_all_workflow_logs" on public.workflow_logs;
drop policy if exists "allow_all_daily_reports" on public.daily_reports;

-- 9) Workspace-scoped policies (authenticated) --------------------------------
drop policy if exists "workspace_members_read_conversations" on public.conversations;
create policy "workspace_members_read_conversations"
  on public.conversations for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_conversations" on public.conversations;
create policy "workspace_members_insert_conversations"
  on public.conversations for insert to authenticated
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_update_conversations" on public.conversations;
create policy "workspace_members_update_conversations"
  on public.conversations for update to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_delete_conversations" on public.conversations;
create policy "workspace_members_delete_conversations"
  on public.conversations for delete to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_read_leads" on public.leads;
create policy "workspace_members_read_leads"
  on public.leads for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_leads" on public.leads;
create policy "workspace_members_insert_leads"
  on public.leads for insert to authenticated
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_update_leads" on public.leads;
create policy "workspace_members_update_leads"
  on public.leads for update to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_delete_leads" on public.leads;
create policy "workspace_members_delete_leads"
  on public.leads for delete to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_read_reply_drafts" on public.reply_drafts;
create policy "workspace_members_read_reply_drafts"
  on public.reply_drafts for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_reply_drafts" on public.reply_drafts;
create policy "workspace_members_insert_reply_drafts"
  on public.reply_drafts for insert to authenticated
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_update_reply_drafts" on public.reply_drafts;
create policy "workspace_members_update_reply_drafts"
  on public.reply_drafts for update to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_delete_reply_drafts" on public.reply_drafts;
create policy "workspace_members_delete_reply_drafts"
  on public.reply_drafts for delete to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_read_followups" on public.followups;
create policy "workspace_members_read_followups"
  on public.followups for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_followups" on public.followups;
create policy "workspace_members_insert_followups"
  on public.followups for insert to authenticated
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_update_followups" on public.followups;
create policy "workspace_members_update_followups"
  on public.followups for update to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_delete_followups" on public.followups;
create policy "workspace_members_delete_followups"
  on public.followups for delete to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_read_workflow_logs" on public.workflow_logs;
create policy "workspace_members_read_workflow_logs"
  on public.workflow_logs for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_workflow_logs" on public.workflow_logs;
create policy "workspace_members_insert_workflow_logs"
  on public.workflow_logs for insert to authenticated
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_read_daily_reports" on public.daily_reports;
create policy "workspace_members_read_daily_reports"
  on public.daily_reports for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_read_business_profiles" on public.business_profiles;
create policy "workspace_members_read_business_profiles"
  on public.business_profiles for select to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_insert_business_profiles" on public.business_profiles;
create policy "workspace_members_insert_business_profiles"
  on public.business_profiles for insert to authenticated
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_update_business_profiles" on public.business_profiles;
create policy "workspace_members_update_business_profiles"
  on public.business_profiles for update to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_members_delete_business_profiles" on public.business_profiles;
create policy "workspace_members_delete_business_profiles"
  on public.business_profiles for delete to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

-- 10) Grants ------------------------------------------------------------------
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;
grant select, insert, update, delete on table public.reply_drafts to authenticated;
grant select, insert, update, delete on table public.followups to authenticated;
grant select, insert on table public.workflow_logs to authenticated;
grant select on table public.daily_reports to authenticated;
grant select, insert, update, delete on table public.business_profiles to authenticated;
