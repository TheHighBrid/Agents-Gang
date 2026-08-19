do $$
declare
  scheduled_jobs_oid oid := to_regclass('public.scheduled_jobs');
  claim_oid oid := to_regprocedure('public.claim_scheduled_job(text,text,text,integer,integer)');
  complete_oid oid := to_regprocedure('public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)');
begin
  if scheduled_jobs_oid is null or claim_oid is null or complete_oid is null then
    raise exception 'Supabase security verification failed: scheduler database boundary is incomplete';
  end if;

  if not exists (
    select 1 from pg_class where oid = scheduled_jobs_oid and relrowsecurity
  ) then
    raise exception 'Supabase security verification failed: scheduled_jobs RLS is disabled';
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid = scheduled_jobs_oid
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'Supabase security verification failed: PUBLIC has scheduled_jobs data privileges';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (claim_oid, complete_oid)
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Supabase security verification failed: PUBLIC can execute scheduler RPCs';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_table_privilege('anon', 'public.scheduled_jobs', 'SELECT')
      or has_table_privilege('anon', 'public.scheduled_jobs', 'INSERT')
      or has_table_privilege('anon', 'public.scheduled_jobs', 'UPDATE')
      or has_table_privilege('anon', 'public.scheduled_jobs', 'DELETE')
      or has_function_privilege('anon', 'public.claim_scheduled_job(text,text,text,integer,integer)', 'EXECUTE')
      or has_function_privilege('anon', 'public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)', 'EXECUTE') then
      raise exception 'Supabase security verification failed: anon can access scheduler persistence';
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_table_privilege('authenticated', 'public.scheduled_jobs', 'SELECT')
      or has_table_privilege('authenticated', 'public.scheduled_jobs', 'INSERT')
      or has_table_privilege('authenticated', 'public.scheduled_jobs', 'UPDATE')
      or has_table_privilege('authenticated', 'public.scheduled_jobs', 'DELETE')
      or has_function_privilege('authenticated', 'public.claim_scheduled_job(text,text,text,integer,integer)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)', 'EXECUTE') then
      raise exception 'Supabase security verification failed: authenticated can access scheduler persistence';
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    if not has_table_privilege('service_role', 'public.scheduled_jobs', 'SELECT')
      or not has_table_privilege('service_role', 'public.scheduled_jobs', 'INSERT')
      or not has_table_privilege('service_role', 'public.scheduled_jobs', 'UPDATE')
      or not has_table_privilege('service_role', 'public.scheduled_jobs', 'DELETE')
      or not has_function_privilege('service_role', 'public.claim_scheduled_job(text,text,text,integer,integer)', 'EXECUTE')
      or not has_function_privilege('service_role', 'public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)', 'EXECUTE') then
      raise exception 'Supabase security verification failed: service_role lacks scheduler persistence access';
    end if;
  end if;

  raise notice 'Agents-Gang Supabase scheduler security verification passed';
end $$;
