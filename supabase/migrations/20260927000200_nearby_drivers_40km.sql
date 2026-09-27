begin;

-- Return only approved, online drivers inside the requested radius of the
-- customer's current position. Coordinates are rounded to roughly 1 km so
-- the Home map can show availability without revealing exact driver GPS.
create or replace function public.fn_nearby_driver_positions_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40
)
returns table(lat double precision, lng double precision)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_lat is null or p_lat < -90 or p_lat > 90
    or p_lng is null or p_lng < -180 or p_lng > 180
    or p_radius_km is null or p_radius_km <= 0 or p_radius_km > 100 then
    raise exception 'Invalid location or radius';
  end if;

  return query
  with latest_profiles as (
    select distinct on (dp.user_id)
      dp.user_id,
      dp.latitude,
      dp.longitude,
      dp.availability_status,
      dp.verification_status
    from public.driver_profiles dp
    order by dp.user_id, dp.created_at desc
  )
  select
    round(dp.latitude::numeric, 2)::double precision as lat,
    round(dp.longitude::numeric, 2)::double precision as lng
  from latest_profiles dp
  where dp.availability_status = 'online'
    and dp.verification_status = 'approved'
    and dp.latitude is not null
    and dp.longitude is not null
    and 6371 * acos(
      least(1::double precision, greatest(-1::double precision,
        cos(radians(p_lat)) * cos(radians(dp.latitude))
          * cos(radians(dp.longitude) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians(dp.latitude))
      ))
    ) <= p_radius_km;
end;
$$;

revoke all on function public.fn_nearby_driver_positions_within_radius(double precision,double precision,double precision) from public, anon;
grant execute on function public.fn_nearby_driver_positions_within_radius(double precision,double precision,double precision) to authenticated;

commit;
