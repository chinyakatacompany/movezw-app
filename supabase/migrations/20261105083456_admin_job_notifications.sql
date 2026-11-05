-- Every new open job reaches each active administrator, independently of
-- driver approval, availability, capacity, and route matching.
create or replace function public.enqueue_admin_job_alerts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'open' then return new; end if;
  insert into public.notifications(user_id,type,title,message,link)
    select p.id, 'admin_new_job', 'New transport job',
      coalesce(new.cargo_type::text,'Cargo') || ' · ' ||
      coalesce(new.pickup_location,'Pickup') || ' → ' || coalesce(new.destination,'Destination'),
      '/admin/jobs?request=' || new.id
    from public.profiles p
    where p.role='admin' and not coalesce(p.is_suspended,false) and p.deleted_at is null;
  return new;
end;
$$;
revoke all on function public.enqueue_admin_job_alerts() from public,anon,authenticated;
drop trigger if exists movezw_admin_job_alerts on public.transport_requests;
create trigger movezw_admin_job_alerts after insert on public.transport_requests
for each row execute function public.enqueue_admin_job_alerts();

-- Keep existing event types and the existing retry/dispatch mechanism.
create or replace function public.enqueue_app_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type in ('driver_registered','new_offer','job_ring','in_app_call','admin_group_call','offer_accepted','admin_new_job') then
    insert into public.app_push_outbox(notification_id) values(new.id) on conflict do nothing;
    begin perform public.dispatch_app_push();
    exception when others then raise warning 'App push deferred to cron'; end;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_app_push() from public,anon,authenticated;

-- Clients cannot forge admin job alerts, even with a permissive legacy policy.
drop policy if exists movezw_admin_job_alerts_only on public.notifications;
create policy movezw_admin_job_alerts_only on public.notifications
as restrictive for insert to authenticated with check(type <> 'admin_new_job');
