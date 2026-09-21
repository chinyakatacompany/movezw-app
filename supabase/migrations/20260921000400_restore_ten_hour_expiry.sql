begin;

-- Restore the original ten-hour circulation window for open, unaccepted
-- requests. Offer guards, the minute-by-minute cron cleanup and the protected
-- admin refresh all use this helper, so the rule stays consistent everywhere.
create or replace function public.request_pickup_deadline(r public.transport_requests)
returns timestamptz language sql stable set search_path = public
as $$
  select (case when r.timing = 'scheduled'
    then coalesce(r.scheduled_date, r.created_at) else r.created_at end)
    + interval '10 hours';
$$;

-- Immediately persist any requests that are already beyond the restored
-- deadline as cancelled, including their expired_at timestamp.
select public.expire_open_requests();

commit;
