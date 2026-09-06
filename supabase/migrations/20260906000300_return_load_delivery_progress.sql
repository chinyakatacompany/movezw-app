begin;

-- Return bookings have their own lifecycle; do not create a second paid job.
create table public.return_load_deliveries (
  id uuid primary key references public.return_load_bookings(id),
  driver_id uuid not null,
  customer_id uuid not null,
  pickup_location text,
  destination text,
  cargo_type text,
  status text not null default 'confirmed' check (status in
    ('confirmed','en_route_pickup','collected','in_transit','delivered','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.return_load_deliveries enable row level security;
create policy "Participants read return delivery progress" on public.return_load_deliveries
  for select to authenticated using (auth.uid() in (driver_id, customer_id));
revoke all on public.return_load_deliveries from anon, authenticated;
grant select on public.return_load_deliveries to authenticated;
create index on public.return_load_deliveries(driver_id, created_at);
create index on public.return_load_deliveries(customer_id, created_at);

create or replace function public.accept_return_load_delivery(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare b public.return_load_bookings; l public.return_loads;
begin
  select * into b from public.return_load_bookings where id = p_booking_id;
  if not found or auth.uid() is null or b.driver_id <> auth.uid() then
    raise exception 'Booking not available to this driver';
  end if;
  -- Always lock the listing first, serializing competing acceptances.
  select * into l from public.return_loads where id = b.return_load_id for update;
  if not found or l.driver_id <> auth.uid() then raise exception 'Listing not available'; end if;
  select * into b from public.return_load_bookings where id = p_booking_id for update;
  if b.driver_id <> auth.uid() or b.return_load_id <> l.id then raise exception 'Booking changed'; end if;
  if b.status = 'accepted' and l.accepted_booking_id = b.id then
    insert into public.return_load_deliveries(id, driver_id, customer_id, pickup_location, destination, cargo_type)
      values(b.id, b.driver_id, b.customer_id, b.pickup_location, b.destination, b.cargo_type)
      on conflict (id) do nothing;
    return b.id;
  end if;
  if b.status <> 'pending' or l.status <> 'open' or l.accepted_booking_id is not null then
    raise exception 'This return load is no longer available';
  end if;
  update public.return_loads set status = 'booked', accepted_booking_id = b.id,
    accepted_customer_id = b.customer_id, accepted_customer_name = b.customer_name where id = l.id;
  update public.return_load_bookings set status = 'accepted' where id = b.id;
  insert into public.notifications(user_id, type, title, message, link)
    select customer_id, 'offer_rejected', 'Return load booking declined',
      'The driver accepted another booking.', '/return-loads'
    from public.return_load_bookings where return_load_id = l.id and status = 'pending';
  update public.return_load_bookings set status = 'rejected' where return_load_id = l.id and status = 'pending';
  insert into public.return_load_deliveries(id, driver_id, customer_id, pickup_location, destination, cargo_type)
    values(b.id, b.driver_id, b.customer_id, b.pickup_location, b.destination, b.cargo_type);
  insert into public.notifications(user_id, type, title, message, link)
    values(b.customer_id, 'offer_accepted', 'Return load booking accepted',
      'Your driver accepted your booking. Follow delivery progress here.', '/return-loads/delivery/' || b.id);
  return b.id;
end;
$$;

create or replace function public.advance_return_load_delivery(p_delivery_id uuid, p_expected_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare d public.return_load_deliveries; next_status text;
begin
  select * into d from public.return_load_deliveries where id = p_delivery_id for update;
  if not found or auth.uid() is null or d.driver_id <> auth.uid() then
    raise exception 'Only the assigned driver can update this delivery';
  end if;
  if d.status is distinct from p_expected_status then raise exception 'Progress changed. Refresh and try again.'; end if;
  if not exists (
    select 1 from public.return_load_bookings b join public.return_loads l on l.id = b.return_load_id
    where b.id = d.id and b.status = 'accepted' and l.status = 'booked'
      and l.accepted_booking_id = b.id and b.driver_id = d.driver_id and b.customer_id = d.customer_id
  ) then raise exception 'This booking is no longer active'; end if;
  next_status := case d.status when 'confirmed' then 'en_route_pickup'
    when 'en_route_pickup' then 'collected' when 'collected' then 'in_transit'
    when 'in_transit' then 'delivered' when 'delivered' then 'completed' end;
  if next_status is null then raise exception 'Delivery already completed'; end if;
  update public.return_load_deliveries set status = next_status, updated_at = now() where id = d.id;
end;
$$;
revoke all on function public.accept_return_load_delivery(uuid) from public, anon;
revoke all on function public.advance_return_load_delivery(uuid,text) from public, anon;
grant execute on function public.accept_return_load_delivery(uuid) to authenticated;
grant execute on function public.advance_return_load_delivery(uuid,text) to authenticated;

-- Also allow existing, selected bookings to open the progress screen.
insert into public.return_load_deliveries(id, driver_id, customer_id, pickup_location, destination, cargo_type)
select b.id, b.driver_id, b.customer_id, b.pickup_location, b.destination, b.cargo_type
from public.return_load_bookings b join public.return_loads l on l.accepted_booking_id = b.id
where b.status = 'accepted' and l.status = 'booked' and b.driver_id = l.driver_id;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.return_load_deliveries;
  end if;
end $$;
commit;
