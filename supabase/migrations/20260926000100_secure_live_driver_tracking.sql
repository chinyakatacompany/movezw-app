begin;

-- Coordinates are written only through fn_update_driver_location. Keeping
-- them on the request row lets the assigned customer, driver and admin use
-- the existing request realtime subscription without a second tracking
-- table or exposing every driver's general location.
alter table public.transport_requests
  add column if not exists driver_lat double precision,
  add column if not exists driver_lng double precision,
  add column if not exists driver_location_updated_at timestamptz;

alter table public.transport_requests
  drop constraint if exists transport_requests_driver_lat_check,
  drop constraint if exists transport_requests_driver_lng_check;

alter table public.transport_requests
  add constraint transport_requests_driver_lat_check
    check (driver_lat is null or driver_lat between -90 and 90),
  add constraint transport_requests_driver_lng_check
    check (driver_lng is null or driver_lng between -180 and 180);

create or replace function public.fn_update_driver_location(
  p_request_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_lat is null or p_lat < -90 or p_lat > 90
    or p_lng is null or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid location coordinates';
  end if;

  update public.transport_requests
  set driver_lat = p_lat,
      driver_lng = p_lng,
      driver_location_updated_at = clock_timestamp()
  where id = p_request_id
    and accepted_driver_id = auth.uid()
    and status in ('confirmed', 'en_route_pickup', 'collected', 'in_transit');

  if not found then
    raise exception 'Only the assigned driver can update an active delivery location';
  end if;
end;
$$;

revoke all on function public.fn_update_driver_location(uuid,double precision,double precision) from public, anon;
grant execute on function public.fn_update_driver_location(uuid,double precision,double precision) to authenticated;

commit;
