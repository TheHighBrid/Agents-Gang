begin;

do $$
declare
  claimed_row record;
  completed_row record;
begin
  select * into claimed_row
  from public.claim_scheduled_job(
    'migration-smoke',
    'migration-smoke-idempotency-key',
    'migration-smoke-agent',
    2,
    60
  );

  if claimed_row.claimed is distinct from true or claimed_row.status <> 'running' then
    raise exception 'Scheduler smoke failed: claim_scheduled_job did not claim a running job';
  end if;

  select * into completed_row
  from public.complete_scheduled_job(
    claimed_row.id,
    'completed',
    false,
    null,
    null
  );

  if completed_row.status <> 'completed' then
    raise exception 'Scheduler smoke failed: complete_scheduled_job did not complete the job';
  end if;
end $$;

rollback;
