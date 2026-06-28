create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp default now(),
  agent_name text not null,
  action_type text not null,
  risk_level int not null,
  title text not null,
  current_value text,
  proposed_value text,
  status text default 'pending',
  approved_at timestamp,
  rejected_at timestamp
);
