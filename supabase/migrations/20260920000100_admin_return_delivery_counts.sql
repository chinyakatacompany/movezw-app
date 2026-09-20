begin;

-- Return-load progress is a job too. Admin dashboards must be able to count
-- it alongside ordinary transport requests, otherwise an in-transit return
-- delivery incorrectly leaves the dashboard total at zero.
drop policy if exists "Admins read return delivery progress" on public.return_load_deliveries;
create policy "Admins read return delivery progress" on public.return_load_deliveries
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

commit;
