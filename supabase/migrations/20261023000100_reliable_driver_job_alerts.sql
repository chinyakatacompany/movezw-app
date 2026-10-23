begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Only the worker can claim/complete delivery. Creating the job and its
-- recipient notifications/outbox entry is one transaction, independent of the
-- customer's connection, navigation, or which client created the request.
create table if not exists public.driver_job_push_outbox (
  request_id uuid primary key references public.transport_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  attempts integer not null default 0,
  delivered_at timestamptz
);
alter table public.driver_job_push_outbox enable row level security;
revoke all on public.driver_job_push_outbox from public, anon, authenticated;
grant all on public.driver_job_push_outbox to service_role;

create or replace function public.dispatch_driver_job_push()
returns void language plpgsql security definer set search_path = '' as $$
declare
  project_url text;
  server_key text;
begin
  if not exists (select 1 from public.driver_job_push_outbox where delivered_at is null) then return; end if;
  select max(decrypted_secret) filter (where name = 'movezw_project_url'),
         max(decrypted_secret) filter (where name = 'movezw_server_secret_key')
    into project_url, server_key from vault.decrypted_secrets;
  if project_url is null or server_key is null then return; end if;
  perform net.http_post(
    url := project_url || '/functions/v1/notify-drivers-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || server_key, 'apikey', server_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.dispatch_driver_job_push() from public, anon, authenticated;

create or replace function public.enqueue_driver_job_alerts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'open' then return new; end if;
  -- Every approved, unsuspended driver gets every newly posted job, even
  -- while busy/offline. Device push still respects the driver's opt-out.
  insert into public.notifications(user_id, type, title, message, link)
    select distinct d.user_id, 'job_assigned', 'New transport job',
      coalesce(new.cargo_type, 'Cargo') || ' · ' || coalesce(new.pickup_location, 'Pickup') || ' → ' || coalesce(new.destination, 'Destination'),
      '/driver/job/' || new.id
    from public.driver_profiles d
    join public.profiles p on p.id = d.user_id
    where d.verification_status = 'approved'
      and not coalesce(p.is_suspended, false)
      and d.user_id is distinct from new.customer_id;
  insert into public.driver_job_push_outbox(request_id) values (new.id) on conflict do nothing;
  -- pg_net sends after commit. Cron retries if this initial dispatch fails.
  -- Push setup must never prevent an otherwise valid job being posted.
  begin
    perform public.dispatch_driver_job_push();
  exception when others then
    raise warning 'Driver push dispatch deferred to cron: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.enqueue_driver_job_alerts() from public, anon, authenticated;
drop trigger if exists movezw_driver_job_alerts on public.transport_requests;
create trigger movezw_driver_job_alerts after insert on public.transport_requests
  for each row execute function public.enqueue_driver_job_alerts();

create or replace function public.claim_driver_job_push_batch()
returns setof public.driver_job_push_outbox language sql security definer set search_path = '' as $$
  with due as (
    select o.request_id from public.driver_job_push_outbox o
    where o.delivered_at is null
      and (o.last_attempt_at is null or o.last_attempt_at < now() - interval '2 minutes')
    order by o.created_at, o.request_id
    for update skip locked limit 10
  )
  update public.driver_job_push_outbox o
    set last_attempt_at = now(), attempts = o.attempts + 1
    from due where o.request_id = due.request_id returning o.*;
$$;
revoke all on function public.claim_driver_job_push_batch() from public, anon, authenticated;
grant execute on function public.claim_driver_job_push_batch() to service_role;

-- Realtime is a fast path; the app also polls/resumes to recover missed events.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'movezw-driver-job-push';
select cron.schedule('movezw-driver-job-push', '* * * * *', 'select public.dispatch_driver_job_push();');
commit;
