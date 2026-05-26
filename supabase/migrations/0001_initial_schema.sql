-- Nexus OS initial schema (production baseline).
-- Tenant root: public.teams. Operational rows carry team_id (+ workspace_id from later migration).

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
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
  team_id uuid references public.teams (id) on delete cascade,
  source text not null default 'webhook',
  customer_name text not null default '',
  customer_email text not null default '',
  message text not null,
  received_at timestamptz not null default now(),
  status text not null default 'unread',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint conversations_source_check check (
    source in ('webhook', 'manual', 'gmail', 'email', 'imap')
  )
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
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
  team_id uuid references public.teams (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  draft_text text not null,
  status text not null default 'pending_approval',
  confidence numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  scheduled_for timestamptz not null,
  action text not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
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
  team_id uuid references public.teams (id) on delete cascade,
  report_date date not null default current_date,
  hours_saved numeric not null default 0,
  revenue_rescued numeric not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists teams_created_at_idx on public.teams (created_at desc);

create index if not exists business_profiles_team_id_idx on public.business_profiles (team_id);

create index if not exists conversations_team_id_idx on public.conversations (team_id);

create index if not exists leads_team_id_idx on public.leads (team_id);

create index if not exists reply_drafts_team_id_idx on public.reply_drafts (team_id);

create index if not exists followups_team_id_idx on public.followups (team_id);

create index if not exists workflow_logs_team_id_idx on public.workflow_logs (team_id);

create index if not exists daily_reports_team_id_idx on public.daily_reports (team_id);
