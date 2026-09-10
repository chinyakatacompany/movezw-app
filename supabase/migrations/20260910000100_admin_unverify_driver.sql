-- Let administrators revoke a driver's verification without removing their
-- account or interrupting a delivery that has already been accepted.
begin;

create or replace function public.admin_unverify_driver(
  p_driver_profile_id uuid,
  p_reason text default null
)
returns public.driver_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.driver_profiles;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only an administrator can unverify a driver.';
  end if;

  select * into target
  from public.driver_profiles
  where id = p_driver_profile_id
    and verification_status = 'approved';

  if target.id is null then
    raise exception 'Verified driver profile not found.';
  end if;

  -- Update every profile row for this account. The normal schema has one,
  -- but covering duplicates prevents an older approved row from keeping the
  -- account eligible for offers.
  update public.driver_profiles
  set verification_status = 'rejected',
      verification_note = coalesce(
        nullif(btrim(p_reason), ''),
        'Your driver verification has been removed. Please review your profile or contact support before taking new jobs.'
      ),
      availability_status = 'offline'
  where user_id = target.user_id;

  -- Withdraw bids which have not yet been accepted. Accepted jobs and their
  -- delivery progress remain untouched so both participants can finish them.
  update public.offers
  set status = 'rejected'
  where driver_id = target.user_id
    and status = 'pending';

  select * into target
  from public.driver_profiles
  where id = p_driver_profile_id;
  return target;
end;
$$;

revoke all on function public.admin_unverify_driver(uuid, text) from public, anon;
grant execute on function public.admin_unverify_driver(uuid, text) to authenticated;

-- Enforce verification in Postgres as well as the UI. This prevents an
-- unverified driver from creating/revising a bid through a stale page or a
-- direct API call, and prevents acceptance of an old pending bid.
create or replace function public.guard_offer_driver_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending', 'accepted') and not exists (
    select 1
    from public.driver_profiles dp
    where dp.user_id = new.driver_id
      and dp.verification_status = 'approved'
  ) then
    raise exception 'Driver verification is required for new job offers.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_offer_driver_verification on public.offers;
create trigger guard_offer_driver_verification
before insert or update on public.offers
for each row execute function public.guard_offer_driver_verification();

commit;
