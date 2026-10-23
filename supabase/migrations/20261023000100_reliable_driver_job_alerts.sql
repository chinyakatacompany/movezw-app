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

create index if not exists movezw_job_inbox_idx on public.notifications(user_id,type,is_read,created_at,id);
create index if not exists movezw_job_notification_link_idx on public.notifications(link,type,user_id);
create index if not exists movezw_driver_active_routes_idx on public.transport_requests(accepted_driver_id,status);
create index if not exists movezw_driver_return_routes_idx on public.return_loads(driver_id,status,departure_date);

-- Use a dedicated random worker credential, never a service-role key in HTTP.
-- Only privileged database code can read it; the worker checks it via an RPC
-- restricted to service_role. Nothing returns the credential to a client.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'movezw_job_push_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'movezw_job_push_token');
  end if;
end $$;

create or replace function public.authorize_driver_job_push(p_token text)
returns boolean language sql security definer set search_path = '' as $$
  select p_token is not null and length(p_token) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'movezw_job_push_token' and decrypted_secret = p_token
  );
$$;
revoke all on function public.authorize_driver_job_push(text) from public, anon, authenticated;
grant execute on function public.authorize_driver_job_push(text) to service_role;

-- Same directional place-name matching used by existing return-load matching.
create or replace function public.job_route_place_matches(a text, b text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(length(trim(a)) > 0 and length(trim(b)) > 0 and (
    strpos(lower(trim(a)), lower(trim(b))) > 0 or strpos(lower(trim(b)), lower(trim(a))) > 0
  ), false);
$$;
revoke all on function public.job_route_place_matches(text,text) from public, anon, authenticated;

create or replace function public.driver_eligible_for_job(p_driver uuid, p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.driver_profiles d join public.profiles p on p.id = d.user_id
    join public.transport_requests r on r.id = p_request
    where d.user_id = p_driver and d.verification_status = 'approved'
      and not coalesce(p.is_suspended,false) and p.deleted_at is null
      and d.user_id is distinct from r.customer_id
      and r.status = 'open' and r.accepted_driver_id is null
      and now() < coalesce(case when r.timing = 'scheduled' then r.scheduled_date end, r.created_at) + interval '24 hours'
      and (d.availability_status = 'online' or exists (
        select 1 from public.return_loads l where l.driver_id = p_driver
          and l.status = 'open' and l.departure_date >= now() - interval '24 hours'
          and public.job_route_place_matches(l.origin, r.pickup_location)
          and public.job_route_place_matches(l.destination, r.destination)
      ) or exists (
        select 1 from public.transport_requests active where active.accepted_driver_id = p_driver
          and active.status in ('confirmed','en_route_pickup','collected','in_transit')
          and public.job_route_place_matches(active.pickup_location,r.pickup_location)
          and public.job_route_place_matches(active.destination,r.destination)
      ))
  );
$$;
revoke all on function public.driver_eligible_for_job(uuid,uuid) from public, anon, authenticated;
grant execute on function public.driver_eligible_for_job(uuid,uuid) to service_role;

-- Guard legacy clients too: their old best-effort inserts cannot bypass the
-- busy/offline route rule or duplicate the transactional notification.
create or replace function public.guard_driver_job_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if new.type not in ('job_assigned','return_load_match') or new.link not like '/driver/job/%' then return new; end if;
  begin request_id := substring(new.link from '^/driver/job/([0-9a-fA-F-]+)$')::uuid;
  exception when invalid_text_representation then return null; end;
  if request_id is null or not public.driver_eligible_for_job(new.user_id,request_id) then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text || new.link,0));
  if exists (select 1 from public.notifications n where n.user_id = new.user_id and n.link = new.link and n.type in ('job_assigned','return_load_match')) then return null; end if;
  new.type := 'job_assigned';
  return new;
end;
$$;
revoke all on function public.guard_driver_job_notification() from public, anon, authenticated;
drop trigger if exists movezw_guard_driver_job_notification on public.notifications;
create trigger movezw_guard_driver_job_notification before insert on public.notifications
  for each row execute function public.guard_driver_job_notification();

create or replace function public.driver_job_push_recipients(p_request uuid)
returns table(user_id uuid) language sql stable security definer set search_path = '' as $$
  select distinct n.user_id from public.notifications n
  where n.type = 'job_assigned' and n.link = '/driver/job/' || p_request
    and public.driver_eligible_for_job(n.user_id,p_request);
$$;
revoke all on function public.driver_job_push_recipients(uuid) from public, anon, authenticated;
grant execute on function public.driver_job_push_recipients(uuid) to service_role;

create or replace function public.dispatch_driver_job_push()
returns void language plpgsql security definer set search_path = '' as $$
declare
  project_url text;
  worker_token text;
begin
  if not exists (select 1 from public.driver_job_push_outbox where delivered_at is null) then return; end if;
  select max(decrypted_secret) filter (where name = 'movezw_project_url'),
         max(decrypted_secret) filter (where name = 'movezw_job_push_token')
    into project_url, worker_token from vault.decrypted_secrets;
  if project_url is null or worker_token is null then return; end if;
  perform net.http_post(
    url := project_url || '/functions/v1/notify-drivers-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-movezw-job-token', worker_token),
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
  -- Online approved drivers get all jobs. Busy/offline drivers receive
  -- only jobs matching an active delivery or an open return-route listing.
  insert into public.notifications(user_id, type, title, message, link)
    select distinct d.user_id, 'job_assigned', 'New transport job',
      coalesce(new.cargo_type::text, 'Cargo') || ' · ' || coalesce(new.pickup_location, 'Pickup') || ' → ' || coalesce(new.destination, 'Destination'),
      '/driver/job/' || new.id
    from public.driver_profiles d
    join public.profiles p on p.id = d.user_id
    where d.verification_status = 'approved'
      and not coalesce(p.is_suspended, false)
      and public.driver_eligible_for_job(d.user_id,new.id);
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
