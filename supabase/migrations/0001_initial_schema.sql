-- Nexus OS initial schema.
-- Tables in scope:
-- business_profiles, conversations, leads, reply_drafts,
-- followups, workflow_logs, daily_reports

create extension if not exists pgcrypto;

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  tone text not null default 'warm, concise, founder-led',
  services jsonb not null default '[]'::jsonb,
  pricing_rules jsonb not null default '{}'::jsonb,
  approval_mode text not null default 'approval_queue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'demo',
  customer_name text not null default '',
  customer_email text not null default '',
  message text not null,
  received_at timestamptz not null default now(),
  status text not null default 'unread',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_name text not null default '',
  customer_email text not null default '',
  intent text not null default 'other',
  urgency text not null default 'medium',
  estimated_value numeric not null default 0,
  risk_type text not null default 'none',
  risk_score numeric not null default 0,
  status text not null default 'new',
  next_action text not null default 'request_approval',
  confidence numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reply_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  draft_text text not null,
  status text not null default 'pending_approval',
  confidence numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  scheduled_for timestamptz not null,
  action text not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_name text not null,
  step text not null,
  result text not null,
  payload jsonb not null default '{}'::jsonb,
  error text,
  timestamp timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null default current_date,
  hours_saved numeric not null default 0,
  revenue_rescued numeric not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (report_date)
);

insert into public.business_profiles (
  name,
  industry,
  tone,
  services,
  pricing_rules,
  approval_mode
)
select
  'Nexus OS Demo Studio',
  'Founder-led service business',
  'warm, concise, consultative, revenue-focused',
  '[
    "Revenue operations workflow automation",
    "AI reply drafting",
    "Customer follow-up systems",
    "CRM cleanup and lead rescue"
  ]'::jsonb,
  '{
    "currency": "LKR",
    "minimum_project": 150000,
    "automation_setup": {
      "starter": 150000,
      "growth": 350000,
      "premium": 750000
    },
    "support_retainer": {
      "monthly_from": 75000
    }
  }'::jsonb,
  'approval_queue'
where not exists (
  select 1 from public.business_profiles
);
