begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.transport_requests
  add column if not exists pickup_alert_sent_at timestamptz;
alter table public.return_load_deliveries
  add column if not exists pickup_alert_sent_at timestamptz;

-- Claims each due pickup exactly once and creates the in-app notifications in
-- the same transaction. The Edge Function uses the returned rows for OS push.
create or replace function public.claim_due_scheduled_pickup_alerts()
returns table (
  recipient_user_id uuid,
  alert_title text,
  alert_body text,
  alert_url text,
  alert_tag text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
begin
  for item in
    with due as (
      select r.id
      from public.transport_requests r
      where r.timing = 'scheduled'
        and r.scheduled_date is not null
        and r.scheduled_date <= clock_timestamp()
        and r.pickup_alert_sent_at is null
        and r.customer_id is not null
        and r.accepted_driver_id is not null
        and r.status in ('confirmed', 'en_route_pickup')
      order by r.scheduled_date, r.id
      for update skip locked
      limit 100
    ), claimed as (
      update public.transport_requests r
      set pickup_alert_sent_at = clock_timestamp()
      from due
      where r.id = due.id
      returning r.id, r.customer_id, r.accepted_driver_id, r.cargo_type,
        r.pickup_location, r.destination
    )
    select * from claimed
  loop
    alert_title := 'Scheduled pickup time has arrived';
    alert_body := coalesce(item.cargo_type, 'Cargo') || ' · '
      || coalesce(item.pickup_location, 'Pickup') || ' → '
      || coalesce(item.destination, 'Destination');

    insert into public.notifications(user_id, type, title, message, link)
    values
      (item.customer_id, 'scheduled_pickup_due', alert_title, alert_body,
        '/customer/request/' || item.id),
      (item.accepted_driver_id, 'scheduled_pickup_due', alert_title, alert_body,
        '/driver/job/' || item.id);

    recipient_user_id := item.customer_id;
    alert_url := '/customer/request/' || item.id;
    alert_tag := 'movezw-pickup-customer-' || item.id;
    return next;

    recipient_user_id := item.accepted_driver_id;
    alert_url := '/driver/job/' || item.id;
    alert_tag := 'movezw-pickup-driver-' || item.id;
    return next;
  end loop;

  for item in
    with due as (
      select d.id
      from public.return_load_deliveries d
      join public.return_load_bookings b on b.id = d.id
      join public.return_loads l on l.accepted_booking_id = b.id
      where b.pickup_time is not null
        and b.pickup_time <= clock_timestamp()
        and d.pickup_alert_sent_at is null
        and d.status in ('confirmed', 'en_route_pickup')
        and b.status = 'accepted'
        and l.status = 'booked'
      order by b.pickup_time, d.id
      for update of d skip locked
      limit 100
    ), claimed as (
      update public.return_load_deliveries d
      set pickup_alert_sent_at = clock_timestamp()
      from due
      where d.id = due.id
      returning d.id, d.customer_id, d.driver_id, d.cargo_type,
        d.pickup_location, d.destination
    )
    select * from claimed
  loop
    alert_title := 'Scheduled pickup time has arrived';
    alert_body := coalesce(item.cargo_type, 'Cargo') || ' · '
      || coalesce(item.pickup_location, 'Pickup') || ' → '
      || coalesce(item.destination, 'Destination');

    insert into public.notifications(user_id, type, title, message, link)
    values
      (item.customer_id, 'scheduled_pickup_due', alert_title, alert_body,
        '/return-loads/delivery/' || item.id),
      (item.driver_id, 'scheduled_pickup_due', alert_title, alert_body,
        '/return-loads/delivery/' || item.id);

    recipient_user_id := item.customer_id;
    alert_url := '/return-loads/delivery/' || item.id;
    alert_tag := 'movezw-return-pickup-customer-' || item.id;
    return next;

    recipient_user_id := item.driver_id;
    alert_url := '/return-loads/delivery/' || item.id;
    alert_tag := 'movezw-return-pickup-driver-' || item.id;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_due_scheduled_pickup_alerts() from public, anon, authenticated;
grant execute on function public.claim_due_scheduled_pickup_alerts() to service_role;

-- The cron safely does nothing until both Vault secrets documented in README
-- exist. Once present, it calls the Edge Function every minute.
select cron.unschedule(jobid)
from cron.job
where jobname = 'movezw-notify-scheduled-pickups';

select cron.schedule(
  'movezw-notify-scheduled-pickups',
  '* * * * *',
  $cron$
    select net.http_post(
      url := secrets.project_url || '/functions/v1/notify-scheduled-pickups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', secrets.server_secret_key,
        'Authorization', 'Bearer ' || secrets.server_secret_key
      ),
      body := '{}'::jsonb
    )
    from (
      select
        max(decrypted_secret) filter (where name = 'movezw_project_url') as project_url,
        max(decrypted_secret) filter (where name = 'movezw_server_secret_key') as server_secret_key
      from vault.decrypted_secrets
    ) secrets
    where secrets.project_url is not null
      and secrets.server_secret_key is not null;
  $cron$
);

commit;
