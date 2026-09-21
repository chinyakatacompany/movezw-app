-- Capacity-aware job matching and a server-side guard against bids from an
-- undersized or differently categorized vehicle. New requests are grouped as
-- Pickup–15 ton or 16–40 ton; legacy requests without capacity data remain
-- biddable so existing jobs are not stranded.

create or replace function public.fn_vehicle_capacity_tons(p_vehicle_type text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_vehicle_type
    when 'Small Delivery Vehicle' then 0.5
    when 'Pickup' then 1
    when 'Cargo Van' then 1.5
    when '1 Ton Truck' then 1
    when '3 Ton Truck' then 3
    when '5 Ton Truck' then 5
    when '10 Ton Truck' then 10
    when '15 Ton Truck' then 15
    when '16 Ton Truck' then 16
    when '20 Ton Truck' then 20
    when '30 Ton Truck' then 30
    when '40 Ton Truck' then 40
    when 'Articulated Truck' then 40
    else null
  end;
$$;

create or replace function public.fn_cargo_weight_tons(p_weight text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
  v_amount numeric;
begin
  v_text := lower(trim(replace(coalesce(p_weight, ''), ',', '')));
  if v_text = '' then return null; end if;
  v_amount := nullif(substring(v_text from '([0-9]+(?:\.[0-9]+)?)'), '')::numeric;
  if v_amount is null or v_amount <= 0 then return null; end if;
  if v_text ~ '(^|[^a-z])(t|ton|tons|tonne|tonnes)([^a-z]|$)' then return v_amount; end if;
  return v_amount / 1000;
exception when invalid_text_representation then
  return null;
end;
$$;

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

  -- PostgreSQL greatest ignores null inputs. Both null means this is an old,
  -- uncategorized request, which intentionally retains the legacy behaviour.
  if v_required_tons is null then return new; end if;

  v_driver_tons := public.fn_vehicle_capacity_tons(v_driver_vehicle);
  if v_driver_tons is null
     or v_required_tons > 40
     or (v_required_tons <= 15 and v_driver_tons > 15)
     or (v_required_tons > 15 and v_driver_tons <= 15)
     or v_driver_tons < v_required_tons then
    raise exception 'Your registered vehicle does not match this job capacity category.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_offer_vehicle_capacity on public.offers;
create trigger enforce_offer_vehicle_capacity
before insert on public.offers
for each row execute function public.tg_enforce_offer_vehicle_capacity();
