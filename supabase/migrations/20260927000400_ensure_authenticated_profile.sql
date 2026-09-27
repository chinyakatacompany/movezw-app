-- A valid Supabase Auth user must always have a matching MoveZW profile.
-- The normal auth.users trigger creates it at signup. This narrowly scoped
-- fallback repairs legacy/missed rows only for the caller's own authenticated
-- user and never accepts a user id from the client.

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  result public.profiles;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, full_name, phone, role)
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', ''),
    coalesce(u.raw_user_meta_data ->> 'phone', ''),
    case
      when u.raw_user_meta_data ->> 'role' = 'driver' then 'driver'
      else 'customer'
    end
  from auth.users u
  where u.id = caller_id
  on conflict (id) do nothing;

  select p.* into result
  from public.profiles p
  where p.id = caller_id;

  if result.id is null then
    raise exception 'Unable to create account profile';
  end if;

  return result;
end;
$$;

revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;
