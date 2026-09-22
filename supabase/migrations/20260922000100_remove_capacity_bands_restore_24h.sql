begin;

-- Remove the Pickup–15 ton / 16–40 ton bid restriction. Drivers return to
-- the original marketplace behaviour where every approved vehicle may view
-- and quote on every open request.
drop trigger if exists enforce_offer_vehicle_capacity on public.offers;
drop function if exists public.tg_enforce_offer_vehicle_capacity();
drop function if exists public.fn_vehicle_capacity_tons(text);
drop function if exists public.fn_cargo_weight_tons(text);

-- Restore the 24-hour circulation window for open, unaccepted requests.
create or replace function public.request_pickup_deadline(r public.transport_requests)
returns timestamptz language sql stable set search_path = public
as $$
  select (case when r.timing = 'scheduled'
    then coalesce(r.scheduled_date, r.created_at) else r.created_at end)
    + interval '24 hours';
$$;

-- Reopen only requests that were automatically expired under the shorter
-- rule but are still inside the restored 24-hour window. Manual cancellations
-- have no expired_at value and are never touched.
update public.transport_requests r
set status = 'open', expired_at = null
where r.status = 'cancelled'
  and r.accepted_driver_id is null
  and r.expired_at is not null
  and public.request_pickup_deadline(r) > clock_timestamp();

select public.expire_open_requests();

commit;
