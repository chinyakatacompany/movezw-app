-- Remove expired requests from active circulation without deleting linked
-- offers, conversations or accounting records. Run once in the SQL Editor.
begin;
create extension if not exists pg_cron;
alter table public.transport_requests add column if not exists expired_at timestamptz;

create or replace function public.request_pickup_deadline(r public.transport_requests)
returns timestamptz language sql stable set search_path = public
as $$
  select (case when r.timing = 'scheduled'
    then coalesce(r.scheduled_date, r.created_at) else r.created_at end)
    + interval '10 hours';
$$;

-- A late acceptance must fail even between scheduled cleanup runs. This
-- trigger runs in the acceptance transaction, rolling back wallet changes.
create or replace function public.guard_request_expiration()
returns trigger language plpgsql set search_path = public
as $$
begin
  if (old.expired_at is not null or
      (old.status = 'open' and old.accepted_driver_id is null
       and public.request_pickup_deadline(old) <= clock_timestamp()))
     and (new.accepted_driver_id is not null or new.status <> 'cancelled') then
    raise exception 'This request has expired. Please post a new request.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_request_expiration on public.transport_requests;
create trigger guard_request_expiration before update on public.transport_requests
for each row execute function public.guard_request_expiration();

create or replace function public.guard_offer_expiration()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r public.transport_requests;
begin
  -- Rejections remain possible during cleanup. Lock the parent to serialize
  -- bids with request acceptance and expiry.
  if new.status in ('pending', 'accepted') then
    select * into r from public.transport_requests where id = new.request_id for update;
    if r.expired_at is not null or
       (r.status = 'open' and r.accepted_driver_id is null
        and public.request_pickup_deadline(r) <= clock_timestamp()) then
      raise exception 'This request has expired. Please choose another job.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_offer_expiration on public.offers;
create trigger guard_offer_expiration before insert or update on public.offers
for each row execute function public.guard_offer_expiration();

create or replace function public.expire_open_requests()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.transport_requests r
  set status = 'cancelled', expired_at = public.request_pickup_deadline(r)
  where r.status = 'open' and r.accepted_driver_id is null
    and public.request_pickup_deadline(r) <= clock_timestamp();
end;
$$;
revoke all on function public.expire_open_requests() from public, anon, authenticated;
select cron.schedule('movezw-expire-open-requests', '* * * * *',
  'select public.expire_open_requests()');
select public.expire_open_requests();
commit;
