begin;

alter table scheduled_jobs disable row level security;
grant execute on function claim_scheduled_job(text, text, text, integer, integer) to public;
grant execute on function complete_scheduled_job(uuid, text, boolean, text, timestamptz) to public;

commit;
