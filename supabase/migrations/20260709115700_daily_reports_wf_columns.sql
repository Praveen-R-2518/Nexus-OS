-- WF5 daily_reports product columns (additive, idempotent).
-- Pulled from live 2026-07-17 for greenfield reproducibility when 0004_gmail_product_alignment
-- was skipped. Does NOT add a `date` column (live uses report_date).

-- Ensure summary is text (0001 greenfield may have jsonb).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_reports'
      and column_name = 'summary'
      and udt_name = 'jsonb'
  ) then
    alter table public.daily_reports
      alter column summary drop default;

    alter table public.daily_reports
      alter column summary type text
      using case
        when jsonb_typeof(summary) = 'string' then trim(both chr(34) from summary::text)
        else summary::text
      end;
  end if;
end $$;

alter table public.daily_reports
  add column if not exists revenue_at_risk numeric not null default 0,
  add column if not exists hot_leads_count integer not null default 0,
  add column if not exists churn_risks_count integer not null default 0,
  add column if not exists replies_drafted integer not null default 0,
  add column if not exists followups_scheduled integer not null default 0,
  add column if not exists messages_processed integer not null default 0,
  add column if not exists drafts_approved integer not null default 0,
  add column if not exists summary_text text not null default '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_reports'
      and column_name = 'summary'
  ) then
    alter table public.daily_reports
      alter column summary set default '',
      alter column summary set not null;
  end if;
end $$;
