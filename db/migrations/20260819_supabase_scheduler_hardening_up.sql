begin;

alter table scheduled_jobs enable row level security;

revoke all on table scheduled_jobs from public;
revoke execute on function claim_scheduled_job(text, text, text, integer, integer) from public;
revoke execute on function complete_scheduled_job(uuid, text, boolean, text, timestamptz) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table scheduled_jobs from anon';
    execute 'revoke execute on function claim_scheduled_job(text, text, text, integer, integer) from anon';
    execute 'revoke execute on function complete_scheduled_job(uuid, text, boolean, text, timestamptz) from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table scheduled_jobs from authenticated';
    execute 'revoke execute on function claim_scheduled_job(text, text, text, integer, integer) from authenticated';
    execute 'revoke execute on function complete_scheduled_job(uuid, text, boolean, text, timestamptz) from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table scheduled_jobs to service_role';
    execute 'grant execute on function claim_scheduled_job(text, text, text, integer, integer) to service_role';
    execute 'grant execute on function complete_scheduled_job(uuid, text, boolean, text, timestamptz) to service_role';
  end if;
end $$;

commit;
