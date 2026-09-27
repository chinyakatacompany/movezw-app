begin;

-- Live delivery coordinates are stored on transport_requests. Explicitly add
-- the table to Supabase Realtime so customer, driver and admin subscriptions
-- receive each secured fn_update_driver_location update. The catalog check
-- keeps this migration safe when Realtime was already enabled in Dashboard.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transport_requests'
  ) then
    alter publication supabase_realtime add table public.transport_requests;
  end if;
end
$$;

-- Send complete updated rows to subscribers. This also makes future delete
-- and filtered-update handling reliable without exposing any new rows; RLS
-- continues to decide which signed-in users may read each request.
alter table public.transport_requests replica identity full;

-- When a customer accepts an offer, the active request may not have received
-- its first trip coordinate yet. Return only that assigned driver's last
-- matching position so the tracking map can appear immediately. The function
-- never exposes unassigned drivers or locations from somebody else's job.
create or replace function public.fn_get_assigned_driver_location(p_request_id uuid)
returns table(latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(r.driver_lat, d.latitude) as latitude,
    coalesce(r.driver_lng, d.longitude) as longitude
  from public.transport_requests r
  left join lateral (
    select dp.latitude, dp.longitude
    from public.driver_profiles dp
    where dp.user_id = r.accepted_driver_id
    order by dp.created_at desc
    limit 1
  ) d on true
  where auth.uid() is not null
    and r.id = p_request_id
    and r.customer_id = auth.uid()
    and r.accepted_driver_id is not null
    and r.status in ('confirmed', 'en_route_pickup', 'collected', 'in_transit')
  limit 1;
$$;

revoke all on function public.fn_get_assigned_driver_location(uuid) from public, anon;
grant execute on function public.fn_get_assigned_driver_location(uuid) to authenticated;

commit;
