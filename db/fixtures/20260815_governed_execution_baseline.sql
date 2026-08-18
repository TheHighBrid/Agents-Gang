create extension if not exists pgcrypto;

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_name text not null,
  action_type text not null,
  target_type text,
  target_id text,
  risk_level integer not null check (risk_level between 1 and 4),
  title text,
  current_value text,
  proposed_value text,
  payload_summary text,
  status text not null default 'pending',
  decided_at timestamptz,
  expires_at timestamptz,
  result text,
  constraint approval_requests_status_check check (status in ('pending', 'approved', 'rejected', 'expired'))
);

create index approval_requests_status_created_at_idx
  on approval_requests (status, created_at desc);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  agent_name text not null,
  provider text,
  model text,
  route_agent text,
  risk_level integer check (risk_level between 1 and 4),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'blocked')),
  input_summary text,
  output_summary text,
  error_code text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0)
);

create index agent_runs_created_at_idx on agent_runs (created_at desc);
create index agent_runs_status_idx on agent_runs (status);

create table routing_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  selected_agent text not null,
  risk_level integer not null check (risk_level between 1 and 4),
  reason text not null,
  needed_tools jsonb not null default '[]'::jsonb,
  approval_required boolean not null
);

create index routing_decisions_run_id_idx on routing_decisions (run_id);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  agent_name text not null,
  tool_name text not null,
  capability text not null check (capability in ('read', 'draft', 'prepare', 'execute')),
  risk_level integer not null check (risk_level between 1 and 4),
  approval_id uuid references approval_requests(id) on delete set null,
  outcome text not null check (outcome in ('blocked', 'succeeded', 'failed')),
  error_code text,
  result_summary jsonb
);

create index tool_calls_run_id_idx on tool_calls (run_id);
create index tool_calls_approval_id_idx on tool_calls (approval_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid references agent_runs(id) on delete cascade,
  agent_name text,
  tool_name text,
  risk_level integer check (risk_level between 1 and 4),
  approval_id uuid references approval_requests(id) on delete set null,
  event_type text not null,
  outcome text not null check (outcome in ('succeeded', 'failed', 'blocked')),
  metadata jsonb not null default '{}'::jsonb
);

create index audit_events_run_id_idx on audit_events (run_id, created_at desc);

create table product_audits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  shopify_product_id text,
  product_title text,
  handle text,
  score integer,
  diagnosis text,
  missing_specs jsonb,
  rewritten_description text,
  seo_title text,
  seo_description text,
  status text not null default 'draft'
);

create table brand_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null,
  title text not null,
  content text not null
);
