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
