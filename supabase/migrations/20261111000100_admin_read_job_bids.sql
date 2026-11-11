create policy movezw_active_admin_read_job_bids on public.offers
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'admin'
    and not coalesce(p.is_suspended, false) and p.deleted_at is null
));
