begin;

-- New return-load deliveries now complete directly from in transit. Keep
-- the delivered branch so an older delivery already stored at that status
-- can still be completed instead of becoming stuck.
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
    when 'in_transit' then 'completed' when 'delivered' then 'completed' end;
  if next_status is null then raise exception 'Delivery already completed'; end if;
  update public.return_load_deliveries set status = next_status, updated_at = now() where id = d.id;
end;
$$;

revoke all on function public.advance_return_load_delivery(uuid,text) from public, anon;
grant execute on function public.advance_return_load_delivery(uuid,text) to authenticated;

commit;
