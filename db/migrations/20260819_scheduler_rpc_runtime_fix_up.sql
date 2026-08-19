begin;

create or replace function claim_scheduled_job(
  p_job_name text,
  p_idempotency_key text,
  p_agent_name text,
  p_max_attempts integer,
  p_lease_seconds integer
)
returns table (
  claimed boolean,
  claim_reason text,
  id uuid,
  job_name text,
  idempotency_key text,
  agent_name text,
  status text,
  attempt_count integer,
  max_attempts integer,
  retryable boolean,
  last_error_code text,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_job scheduled_jobs%rowtype;
  v_claimed boolean := false;
begin
  if p_job_name is null or length(trim(p_job_name)) = 0
    or p_idempotency_key is null or length(trim(p_idempotency_key)) = 0
    or p_agent_name is null or length(trim(p_agent_name)) = 0 then
    raise exception 'scheduler job identity is required';
  end if;
  if p_max_attempts < 1 or p_max_attempts > 10 then
    raise exception 'scheduler max attempts must be between 1 and 10';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'scheduler lease must be between 30 and 3600 seconds';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_job_name));
  if not exists (select 1 from scheduled_jobs where scheduled_jobs.idempotency_key = p_idempotency_key) then
    select * into v_job
    from scheduled_jobs
    where scheduled_jobs.job_name = p_job_name
      and scheduled_jobs.status = 'running'
      and scheduled_jobs.lease_expires_at > now()
    order by scheduled_jobs.created_at
    limit 1;
    if found then
      return query select
        false,
        'concurrency_limited',
        v_job.id,
        v_job.job_name,
        v_job.idempotency_key,
        v_job.agent_name,
        v_job.status,
        v_job.attempt_count,
        v_job.max_attempts,
        v_job.retryable,
        v_job.last_error_code,
        v_job.lease_expires_at,
        v_job.next_retry_at,
        v_job.created_at,
        v_job.updated_at,
        v_job.completed_at;
      return;
    end if;
  end if;

  insert into scheduled_jobs (
    job_name, idempotency_key, agent_name, status, attempt_count, max_attempts,
    retryable, lease_expires_at
  ) values (
    p_job_name, p_idempotency_key, p_agent_name, 'running', 1, p_max_attempts,
    false, now() + make_interval(secs => p_lease_seconds)
  )
  on conflict on constraint scheduled_jobs_idempotency_key_key do update
  set status = 'running',
      attempt_count = scheduled_jobs.attempt_count + 1,
      retryable = false,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      next_retry_at = null,
      completed_at = null,
      updated_at = now()
  where scheduled_jobs.attempt_count < scheduled_jobs.max_attempts
    and (
      (scheduled_jobs.status = 'retry_scheduled' and scheduled_jobs.next_retry_at <= now())
      or (scheduled_jobs.status = 'running' and scheduled_jobs.lease_expires_at <= now())
    )
  returning * into v_job;

  if found then
    v_claimed := true;
  else
    select * into v_job from scheduled_jobs where scheduled_jobs.idempotency_key = p_idempotency_key;
  end if;

  return query select
    v_claimed,
    case when v_claimed then null else 'duplicate' end,
    v_job.id,
    v_job.job_name,
    v_job.idempotency_key,
    v_job.agent_name,
    v_job.status,
    v_job.attempt_count,
    v_job.max_attempts,
    v_job.retryable,
    v_job.last_error_code,
    v_job.lease_expires_at,
    v_job.next_retry_at,
    v_job.created_at,
    v_job.updated_at,
    v_job.completed_at;
end;
$$;

commit;
