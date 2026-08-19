begin;

alter function claim_scheduled_job(text, text, text, integer, integer) set search_path = public;
alter function complete_scheduled_job(uuid, text, boolean, text, timestamptz) set search_path = public;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public;

    if exists (select 1 from pg_roles where rolname = 'anon') then
      revoke execute on function public.rls_auto_enable() from anon;
    end if;

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      revoke execute on function public.rls_auto_enable() from authenticated;
    end if;
  end if;
end $$;

commit;
