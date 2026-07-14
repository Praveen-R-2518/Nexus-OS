-- Settings page: workspace prefs on business_profiles + disconnected credential status.

alter table public.business_profiles
  add column if not exists timezone text,
  add column if not exists high_value_threshold numeric not null default 500,
  add column if not exists high_risk_score numeric not null default 0.8,
  add column if not exists notification_prefs jsonb not null default '{"buy_back_report_email":false,"high_value_lead_alerts":false}'::jsonb;

comment on column public.business_profiles.timezone is
  'IANA timezone for workspace reporting and scheduling (e.g. America/New_York).';

comment on column public.business_profiles.high_value_threshold is
  'Estimated lead value at or above this amount is hard-gated from autopilot send.';

comment on column public.business_profiles.high_risk_score is
  'Lead risk score 0..1 at or above this value is hard-gated from autopilot send.';

comment on column public.business_profiles.notification_prefs is
  'User notification preferences (buy-back report email, high-value lead alerts).';

-- Extend credential status to allow disconnect without deleting rows.
alter table public.gmail_credentials
  drop constraint if exists gmail_credentials_status_check;

alter table public.gmail_credentials
  add constraint gmail_credentials_status_check
  check (status in ('pending', 'connected', 'failed', 'disconnected'));

alter table public.meta_credentials
  drop constraint if exists meta_credentials_status_check;

alter table public.meta_credentials
  add constraint meta_credentials_status_check
  check (status in ('pending', 'connected', 'failed', 'disconnected'));
