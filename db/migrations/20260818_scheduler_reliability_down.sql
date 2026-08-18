begin;

drop function if exists complete_scheduled_job(uuid, text, boolean, text, timestamptz);
drop function if exists claim_scheduled_job(text, text, text, integer, integer);
drop table if exists scheduled_jobs;

commit;
