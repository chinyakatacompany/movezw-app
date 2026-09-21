begin;

-- Open, unaccepted requests remain available for 24 hours from their pickup
-- schedule (or creation time for "now" jobs). The original migration used
-- ten hours; replacing this helper updates the offer guards and cron cleanup
-- together because they all call this one function.
create or replace function public.request_pickup_deadline(r public.transport_requests)
returns timestamptz language sql stable set search_path = public
as $$
  select (case when r.timing = 'scheduled'
    then coalesce(r.scheduled_date, r.created_at) else r.created_at end)
    + interval '24 hours';
$$;

-- Let an authenticated administrator force the same authoritative cleanup
-- before loading Job Management. pg_cron still runs it every minute; this RPC
-- closes the small gap after a missed/delayed cron run and guarantees that the
-- admin sees an actual cancelled status rather than a client-only hidden job.
create or replace function public.fn_admin_expire_open_requests()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  perform public.expire_open_requests();
end;
$$;

revoke all on function public.fn_admin_expire_open_requests() from public, anon;
grant execute on function public.fn_admin_expire_open_requests() to authenticated;

-- Apply the new 24-hour rule immediately to any currently overdue requests.
select public.expire_open_requests();

commit;
