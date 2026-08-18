begin;

alter table approval_requests drop constraint if exists approval_requests_status_check;
alter table approval_requests add constraint approval_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'consumed'));

commit;
