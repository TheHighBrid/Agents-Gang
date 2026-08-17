create extension if not exists pgcrypto;

create table if not exists approval_requests (
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
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  decided_at timestamptz,
  expires_at timestamptz,
  result text
);

create index if not exists approval_requests_status_created_at_idx
  on approval_requests (status, created_at desc);

create table if not exists agent_runs (
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

create index if not exists agent_runs_created_at_idx on agent_runs (created_at desc);
create index if not exists agent_runs_status_idx on agent_runs (status);

create table if not exists routing_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  selected_agent text not null,
  risk_level integer not null check (risk_level between 1 and 4),
  reason text not null,
  needed_tools jsonb not null default '[]'::jsonb,
  approval_required boolean not null
);

create index if not exists routing_decisions_run_id_idx on routing_decisions (run_id);

create table if not exists tool_calls (
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

create index if not exists tool_calls_run_id_idx on tool_calls (run_id);
create index if not exists tool_calls_approval_id_idx on tool_calls (approval_id);

create table if not exists audit_events (
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

create index if not exists audit_events_run_id_idx on audit_events (run_id, created_at desc);

create table if not exists product_audits (
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

create table if not exists brand_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null,
  title text not null,
  content text not null
);


alter table agent_runs
  add column if not exists idempotency_key text;

create unique index if not exists agent_runs_idempotency_key_idx
  on agent_runs (idempotency_key)
  where idempotency_key is not null;

create table if not exists job_leases (
  lease_key text primary key,
  owner_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create or replace function acquire_job_lease(
  p_lease_key text,
  p_owner_id text,
  p_lease_duration_ms integer
)
returns table (lease_key text, owner_id text, acquired_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_time timestamptz := clock_timestamp();
  result job_leases%rowtype;
begin
  if p_lease_duration_ms <= 0 then
    raise exception 'lease duration must be positive';
  end if;

  insert into job_leases (lease_key, owner_id, acquired_at, expires_at)
  values (
    p_lease_key,
    p_owner_id,
    current_time,
    current_time + make_interval(msecs => p_lease_duration_ms)
  )
  on conflict (lease_key) do update
    set owner_id = excluded.owner_id,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where job_leases.expires_at <= current_time
  returning job_leases.* into result;

  if result.lease_key is not null then
    return query select result.lease_key, result.owner_id, result.acquired_at, result.expires_at;
  end if;
end;
$$;

create or replace function release_job_lease(p_lease_key text, p_owner_id text)
returns table (released boolean)
language sql
security definer
set search_path = public
as $$
  delete from job_leases
  where lease_key = p_lease_key and owner_id = p_owner_id
  returning true as released;
$$;


alter table agent_runs
  add column if not exists correlation_id text;
alter table routing_decisions
  add column if not exists correlation_id text;
alter table audit_events
  add column if not exists correlation_id text;
alter table tool_calls
  add column if not exists correlation_id text;

create index if not exists agent_runs_correlation_id_idx on agent_runs (correlation_id);
create index if not exists routing_decisions_correlation_id_idx on routing_decisions (correlation_id);
create index if not exists audit_events_correlation_id_idx on audit_events (correlation_id, created_at desc);
create index if not exists tool_calls_correlation_id_idx on tool_calls (correlation_id, created_at desc);
