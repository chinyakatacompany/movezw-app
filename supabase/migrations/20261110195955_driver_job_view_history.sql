create table public.driver_job_views (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.transport_requests(id) on delete cascade,
  driver_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index driver_job_views_by_job on public.driver_job_views(request_id, viewed_at desc, id desc);
alter table public.driver_job_views enable row level security;
revoke all on public.driver_job_views from public, anon, authenticated;
grant insert(request_id), select on public.driver_job_views to authenticated;
create policy record_own_view on public.driver_job_views for insert to authenticated
with check (driver_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role='driver' and not coalesce(p.is_suspended,false) and p.deleted_at is null
) and exists (select 1 from public.transport_requests r where r.id=request_id));
create policy admin_read_views on public.driver_job_views for select to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid())
  and p.role='admin' and not coalesce(p.is_suspended,false) and p.deleted_at is null));

-- Count across the complete history, independently of the visible detail page.
create function public.job_monthly_viewers(p_request uuid)
returns table(month_start date, viewers bigint)
language sql stable security invoker set search_path='' as $$
  with months as (
    select generate_series(
      date_trunc('month', now() at time zone 'Africa/Harare') - interval '11 months',
      date_trunc('month', now() at time zone 'Africa/Harare'), interval '1 month') as start
  )
  select m.start::date, count(distinct v.driver_id)
  from months m left join public.driver_job_views v
    on v.request_id=p_request
    and v.viewed_at >= (m.start at time zone 'Africa/Harare')
    and v.viewed_at < ((m.start + interval '1 month') at time zone 'Africa/Harare')
  group by m.start order by m.start;
$$;
revoke all on function public.job_monthly_viewers(uuid) from public,anon;
grant execute on function public.job_monthly_viewers(uuid) to authenticated;
