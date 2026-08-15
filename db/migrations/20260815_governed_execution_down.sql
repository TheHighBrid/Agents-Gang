begin;

drop table if exists audit_events;
drop table if exists tool_calls;
drop table if exists routing_decisions;
drop table if exists agent_runs;

drop index if exists approval_requests_status_created_at_idx;

alter table approval_requests
  drop column if exists result,
  drop column if exists expires_at,
  drop column if exists decided_at,
  drop column if exists updated_at,
  drop column if exists payload_summary,
  drop column if exists target_id,
  drop column if exists target_type;

commit;
