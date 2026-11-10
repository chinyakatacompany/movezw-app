alter table public.transport_requests add column vehicle_category text check (vehicle_category in ('Cargo Van', 'Pickup', '1–4 tonnes', '5–10 tonnes', '11–20 tonnes', '20 tonnes and above'));
create or replace function public.driver_eligible_for_job(p_driver uuid, p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.driver_profiles d join public.profiles p on p.id = d.user_id
    join public.transport_requests r on r.id = p_request
    where d.user_id = p_driver and d.verification_status = 'approved'
      and not coalesce(p.is_suspended,false) and p.deleted_at is null
      and d.user_id is distinct from r.customer_id
      and (r.vehicle_category is null or
        ((r.vehicle_category in ('11–20 tonnes','20 tonnes and above')) =
         (d.vehicle_type::text in ('15 Ton Truck','20 Ton Truck','30 Ton Truck','40 Ton Truck','Articulated Truck'))))
      and r.status = 'open' and r.accepted_driver_id is null
      and now() < coalesce(case when r.timing = 'scheduled' then r.scheduled_date end, r.created_at) + interval '24 hours'
      and (d.availability_status = 'online' or exists (
        select 1 from public.return_loads l where l.driver_id = p_driver
          and l.status = 'open' and l.departure_date >= now() - interval '24 hours'
          and public.job_route_place_matches(l.origin, r.pickup_location)
          and public.job_route_place_matches(l.destination, r.destination)
      ) or exists (
        select 1 from public.transport_requests active where active.accepted_driver_id = p_driver
          and active.status in ('confirmed','en_route_pickup','collected','in_transit')
          and public.job_route_place_matches(active.pickup_location,r.pickup_location)
          and public.job_route_place_matches(active.destination,r.destination)
      ))
  );
$$;
revoke all on function public.driver_eligible_for_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.driver_eligible_for_job(uuid,uuid) to service_role;
