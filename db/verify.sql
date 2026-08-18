do $$
begin
  if to_regclass('public.approval_requests') is null then
    raise exception 'Schema verification failed: approval_requests is missing';
  end if;
  if to_regclass('public.agent_runs') is null then
    raise exception 'Schema verification failed: agent_runs is missing';
  end if;
  if to_regclass('public.routing_decisions') is null then
    raise exception 'Schema verification failed: routing_decisions is missing';
  end if;
  if to_regclass('public.tool_calls') is null then
    raise exception 'Schema verification failed: tool_calls is missing';
  end if;
  if to_regclass('public.audit_events') is null then
    raise exception 'Schema verification failed: audit_events is missing';
  end if;
  if to_regclass('public.scheduled_jobs') is null then
    raise exception 'Schema verification failed: scheduled_jobs is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approval_requests' and column_name = 'updated_at'
  ) then
    raise exception 'Schema verification failed: approval_requests.updated_at is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approval_requests' and column_name = 'target_type'
  ) then
    raise exception 'Schema verification failed: approval_requests.target_type is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approval_requests' and column_name = 'target_id'
  ) then
    raise exception 'Schema verification failed: approval_requests.target_id is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approval_requests' and column_name = 'payload_summary'
  ) then
    raise exception 'Schema verification failed: approval_requests.payload_summary is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'approval_requests_status_created_at_idx'
  ) then
    raise exception 'Schema verification failed: approval_requests_status_created_at_idx is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'scheduled_jobs_status_retry_idx'
  ) then
    raise exception 'Schema verification failed: scheduled_jobs_status_retry_idx is missing';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'scheduled_jobs_lease_idx'
  ) then
    raise exception 'Schema verification failed: scheduled_jobs_lease_idx is missing';
  end if;

  if to_regprocedure('public.claim_scheduled_job(text,text,text,integer,integer)') is null then
    raise exception 'Schema verification failed: claim_scheduled_job is missing';
  end if;
  if to_regprocedure('public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)') is null then
    raise exception 'Schema verification failed: complete_scheduled_job is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.approval_requests'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%consumed%'
  ) then
    raise exception 'Schema verification failed: approval_requests consumed status constraint is missing';
  end if;

  raise notice 'Agents-Gang schema verification passed';
end $$;
