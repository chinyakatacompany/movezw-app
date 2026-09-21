-- Match at category level rather than requiring the driver's exact registered
-- tonnage to meet or exceed the requested tonnage. A 20-ton vehicle therefore
-- sees and may bid on a 30-ton request because both are in the 16–40 ton band.

create or replace function public.tg_enforce_offer_vehicle_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_vehicle text;
  v_cargo_weight text;
  v_driver_vehicle text;
  v_required_tons numeric;
  v_driver_tons numeric;
begin
  select vehicle_type, cargo_weight::text
    into v_request_vehicle, v_cargo_weight
    from public.transport_requests
   where id = new.request_id;

  select vehicle_type
    into v_driver_vehicle
    from public.driver_profiles
   where id = new.driver_profile_id
     and user_id = new.driver_id;

  v_required_tons := greatest(
    public.fn_vehicle_capacity_tons(v_request_vehicle),
    public.fn_cargo_weight_tons(v_cargo_weight)
  );

  if v_required_tons is null then return new; end if;

  v_driver_tons := public.fn_vehicle_capacity_tons(v_driver_vehicle);
  if v_driver_tons is null
     or v_required_tons > 40
     or (v_required_tons <= 15 and v_driver_tons > 15)
     or (v_required_tons > 15 and v_driver_tons <= 15) then
    raise exception 'Your registered vehicle does not match this job capacity category.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
