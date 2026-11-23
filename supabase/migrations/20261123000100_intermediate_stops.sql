alter table public.transport_requests add column if not exists intermediate_stops jsonb not null default '[]'::jsonb;
create or replace function public.valid_intermediate_stops(stops jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare s jsonb;
begin
 if jsonb_typeof(stops) is distinct from 'array' then return false; end if;
 if jsonb_array_length(stops) > 8 then return false; end if;
 for s in select value from jsonb_array_elements(stops) loop
   if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'label') is distinct from 'string' or length(btrim(s->>'label')) not between 1 and 1000 or jsonb_typeof(s->'lat') is distinct from 'number' or jsonb_typeof(s->'lng') is distinct from 'number' or coalesce(s->>'type','') not in ('pickup','dropoff','both') then return false; end if;
   if (s->>'lat')::numeric not between -90 and 90 or (s->>'lng')::numeric not between -180 and 180 then return false; end if;
 end loop;
 return true;
end $$;
alter table public.transport_requests add constraint transport_requests_valid_intermediate_stops check (public.valid_intermediate_stops(intermediate_stops));
