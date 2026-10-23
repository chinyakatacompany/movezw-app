begin;
create or replace function public.admin_user_directory() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not coalesce(is_suspended,false) and deleted_at is null) then raise exception 'Administrator access required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('email',u.email,'email_confirmed_at',u.email_confirmed_at) order by p.created_at desc),'[]'::jsonb) from public.profiles p join auth.users u on u.id=p.id);
end $$;
revoke all on function public.admin_user_directory() from public,anon;
grant execute on function public.admin_user_directory() to authenticated;

create or replace function public.notify_new_driver_registration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.role='driver' then
  insert into public.notifications(user_id,type,title,message,link)
  select id,'driver_registered','New driver registered',coalesce(nullif(trim(new.full_name),''),'A driver')||' registered. Email confirmation and documents may still be pending.','/admin/users'
  from public.profiles where role='admin' and not coalesce(is_suspended,false) and deleted_at is null;
 end if;
 return new;
end $$;
revoke all on function public.notify_new_driver_registration() from public,anon,authenticated;
create trigger movezw_new_driver_registered after insert on public.profiles for each row execute function public.notify_new_driver_registration();

create or replace function public.notify_customer_bid() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' and (tg_op='INSERT' or new.price is distinct from old.price or new.eta_minutes is distinct from old.eta_minutes) then
  insert into public.notifications(user_id,type,title,message,link)
  select r.customer_id,'new_offer','New driver bid', 'A driver quoted $'||new.price::text||' for your transport request.','/customer/request/'||r.id
  from public.transport_requests r where r.id=new.request_id and r.status='open';
 end if;
 return new;
end $$;
revoke all on function public.notify_customer_bid() from public,anon,authenticated;
create trigger movezw_customer_bid after insert or update of price,eta_minutes on public.offers for each row execute function public.notify_customer_bid();

-- Reserved alerts can only be created by trusted triggers/RPCs, never forged
-- with an arbitrary client notification insert.
create policy movezw_server_alerts_only on public.notifications as restrictive for insert to authenticated
with check(type not in ('driver_registered','new_offer','job_ring','in_app_call'));

create table public.app_push_outbox(notification_id uuid primary key references public.notifications(id) on delete cascade,attempts int not null default 0,last_attempt_at timestamptz,delivered_at timestamptz);
alter table public.app_push_outbox enable row level security;
revoke all on public.app_push_outbox from public,anon,authenticated;
grant all on public.app_push_outbox to service_role;
create or replace function public.dispatch_app_push() returns void language plpgsql security definer set search_path='' as $$
declare base_url text; token text;
begin
 if not exists(select 1 from public.app_push_outbox where delivered_at is null) then return; end if;
 select max(decrypted_secret) filter(where name='movezw_project_url'), max(decrypted_secret) filter(where name='movezw_job_push_token') into base_url,token from vault.decrypted_secrets;
 if base_url is null or token is null then return; end if;
 perform net.http_post(url:=base_url||'/functions/v1/notify-app-events',headers:=jsonb_build_object('Content-Type','application/json','x-movezw-job-token',token),body:='{}'::jsonb,timeout_milliseconds:=10000);
end $$;
revoke all on function public.dispatch_app_push() from public,anon,authenticated;
create or replace function public.enqueue_app_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.type in ('driver_registered','new_offer','job_ring','in_app_call') then
  insert into public.app_push_outbox(notification_id) values(new.id) on conflict do nothing;
  begin perform public.dispatch_app_push(); exception when others then raise warning 'App push deferred to cron'; end;
 end if; return new;
end $$;
revoke all on function public.enqueue_app_push() from public,anon,authenticated;
create trigger movezw_app_push after insert on public.notifications for each row execute function public.enqueue_app_push();
create or replace function public.claim_app_push_batch() returns setof public.app_push_outbox language sql security definer set search_path='' as $$
 with due as(select notification_id from public.app_push_outbox where delivered_at is null and(last_attempt_at is null or last_attempt_at<now()-interval '2 minutes') order by notification_id for update skip locked limit 20)
 update public.app_push_outbox o set attempts=o.attempts+1,last_attempt_at=now() from due where o.notification_id=due.notification_id returning o.*;
$$;
revoke all on function public.claim_app_push_batch() from public,anon,authenticated;
grant execute on function public.claim_app_push_batch() to service_role;
select cron.schedule('movezw-app-push','* * * * *','select public.dispatch_app_push();');

create or replace function public.communication_pair_allowed(p_request uuid,p_customer uuid,p_driver uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_request is null then exists(select 1 from public.profiles where id in(p_customer,p_driver) and role='admin' and not coalesce(is_suspended,false) and deleted_at is null)
 else not exists(select 1 from public.profiles where id in(p_customer,p_driver) and (is_suspended or deleted_at is not null)) and exists(select 1 from public.transport_requests r where r.id=p_request and r.customer_id=p_customer and r.accepted_driver_id=p_driver and r.status in('confirmed','en_route_pickup','collected','in_transit','delivered','completed')) end;
$$;
revoke all on function public.communication_pair_allowed(uuid,uuid,uuid) from public,anon;
grant execute on function public.communication_pair_allowed(uuid,uuid,uuid) to authenticated,service_role;
create policy movezw_conversation_acceptance on public.conversations as restrictive for all to authenticated
 using(public.communication_pair_allowed(request_id,customer_id,driver_id)) with check(public.communication_pair_allowed(request_id,customer_id,driver_id));
create or replace function public.conversation_access_allowed(p_conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversations c where c.id=p_conversation and(auth.uid() in(c.customer_id,c.driver_id) or public.is_admin()) and public.communication_pair_allowed(c.request_id,c.customer_id,c.driver_id));
$$;
revoke all on function public.conversation_access_allowed(uuid) from public,anon;
grant execute on function public.conversation_access_allowed(uuid) to authenticated;
create policy movezw_message_acceptance on public.messages as restrictive for all to authenticated
 using(public.conversation_access_allowed(conversation_id)) with check(public.conversation_access_allowed(conversation_id));
create or replace function public.freeze_conversation_pair() returns trigger language plpgsql set search_path='' as $$
begin
 if new.customer_id is distinct from old.customer_id or new.driver_id is distinct from old.driver_id or new.request_id is distinct from old.request_id then raise exception 'Conversation participants cannot be changed'; end if; return new;
end $$;
revoke all on function public.freeze_conversation_pair() from public,anon,authenticated;
create trigger movezw_freeze_conversation before update on public.conversations for each row execute function public.freeze_conversation_pair();

create table public.job_ring_events(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.transport_requests(id) on delete cascade,sender_id uuid not null references public.profiles(id),recipient_id uuid not null references public.profiles(id),created_at timestamptz not null default now());
alter table public.job_ring_events enable row level security;
revoke all on public.job_ring_events from public,anon,authenticated;
create index on public.job_ring_events(sender_id,recipient_id,created_at);
create or replace function public.ring_job_party(p_request uuid,p_recipient uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.transport_requests; driver uuid;
begin
 if auth.uid() is null or auth.uid()=p_recipient then raise exception 'Not authorized'; end if;
 select * into r from public.transport_requests where id=p_request;
 driver:=case when auth.uid()=r.customer_id then p_recipient else auth.uid() end;
 if r.id is null or r.status<>'open' or not (r.customer_id in(auth.uid(),p_recipient)) or not exists(select 1 from public.offers o where o.request_id=r.id and o.driver_id=driver and o.status='pending') or not exists(select 1 from public.driver_profiles d join public.profiles p on p.id=d.user_id where d.user_id=driver and d.verification_status='approved' and not coalesce(p.is_suspended,false)) then raise exception 'A pending bid on this job is required'; end if;
 if exists(select 1 from public.profiles where id in(auth.uid(),p_recipient) and(is_suspended or deleted_at is not null)) then raise exception 'Account unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_recipient::text,0));
 if exists(select 1 from public.job_ring_events where sender_id=auth.uid() and recipient_id=p_recipient and created_at>now()-interval '60 seconds') then raise exception 'Please wait a minute before ringing again'; end if;
 insert into public.job_ring_events(request_id,sender_id,recipient_id) values(r.id,auth.uid(),p_recipient);
 insert into public.notifications(user_id,type,title,message,link) values(p_recipient,'job_ring','Attention requested','Please review this transport job. Voice and chat unlock only after acceptance.',case when p_recipient=r.customer_id then '/customer/request/' else '/driver/job/' end||r.id);
end $$;
revoke all on function public.ring_job_party(uuid,uuid) from public,anon;
grant execute on function public.ring_job_party(uuid,uuid) to authenticated;

create table public.job_calls(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.transport_requests(id) on delete cascade,caller_id uuid not null references public.profiles(id),callee_id uuid not null references public.profiles(id),status text not null default 'ringing' check(status in('ringing','connecting','ended','declined')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '45 seconds');
create table public.job_call_signals(id uuid primary key default gen_random_uuid(),call_id uuid not null references public.job_calls(id) on delete cascade,sender_id uuid not null references public.profiles(id),kind text not null check(kind in('offer','answer','ice')),payload jsonb not null,created_at timestamptz not null default now());
alter table public.job_calls enable row level security;
alter table public.job_call_signals enable row level security;
revoke all on public.job_calls,public.job_call_signals from public,anon,authenticated;
grant select on public.job_calls,public.job_call_signals to authenticated;
create index on public.job_calls(callee_id,status,expires_at);
create index on public.job_calls(caller_id,status,expires_at);
create index on public.job_call_signals(call_id,created_at,id);
create or replace function public.job_call_access(p_call uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.job_calls c join public.transport_requests r on r.id=c.request_id where c.id=p_call and auth.uid() in(c.caller_id,c.callee_id) and public.communication_pair_allowed(r.id,r.customer_id,r.accepted_driver_id));
$$;
revoke all on function public.job_call_access(uuid) from public,anon;
grant execute on function public.job_call_access(uuid) to authenticated;
create policy call_read on public.job_calls for select to authenticated using(public.job_call_access(id));
create policy signal_read on public.job_call_signals for select to authenticated using(public.job_call_access(call_id));
create or replace function public.start_job_call(p_request uuid) returns public.job_calls language plpgsql security definer set search_path='' as $$
declare r public.transport_requests; target uuid; c public.job_calls;
begin
 select * into r from public.transport_requests where id=p_request;
 if auth.uid() is null or auth.uid() not in(r.customer_id,r.accepted_driver_id) or not public.communication_pair_allowed(r.id,r.customer_id,r.accepted_driver_id) then raise exception 'Calls unlock only for the accepted job participants'; end if;
 target:=case when auth.uid()=r.customer_id then r.accepted_driver_id else r.customer_id end;
 if exists(select 1 from public.profiles where id in(auth.uid(),target) and(is_suspended or deleted_at is not null)) then raise exception 'Account unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(auth.uid()::text,target::text),0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(auth.uid()::text,target::text),0));
 if exists(select 1 from public.job_calls where status in('ringing','connecting') and expires_at>now() and(caller_id in(auth.uid(),target) or callee_id in(auth.uid(),target))) then raise exception 'A participant is already on a call'; end if;
 insert into public.job_calls(request_id,caller_id,callee_id) values(r.id,auth.uid(),target) returning * into c;
 insert into public.notifications(user_id,type,title,message,link) values(target,'in_app_call','Incoming MoveZW call','Open MoveZW to answer the call for your accepted job.',case when target=r.customer_id then '/customer/request/' else '/driver/job/' end||r.id);
 return c;
end $$;
create or replace function public.respond_job_call(p_call uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare c public.job_calls;
begin
 select * into c from public.job_calls where id=p_call for update;
 if auth.uid() is null or auth.uid() not in(c.caller_id,c.callee_id) then raise exception 'Not authorized'; end if;
 if p_action='accept' then
  if auth.uid()<>c.callee_id or c.status<>'ringing' or c.expires_at<=now() or not public.job_call_access(c.id) then raise exception 'Call cannot be accepted'; end if;
  update public.job_calls set status='connecting',expires_at=now()+interval '1 hour' where id=c.id;
 elsif p_action in('end','decline') then update public.job_calls set status=case when p_action='decline' then 'declined' else 'ended' end,expires_at=now() where id=c.id;
 else raise exception 'Invalid action'; end if;
end $$;
create or replace function public.send_job_call_signal(p_call uuid,p_kind text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.job_calls;
begin
 select * into c from public.job_calls where id=p_call;
 if not public.job_call_access(c.id) or c.status not in('ringing','connecting') or c.expires_at<=now() then raise exception 'Call is not active'; end if;
 if p_kind not in('offer','answer','ice') or octet_length(p_payload::text)>65536 then raise exception 'Invalid signal'; end if;
 if p_kind='offer' and auth.uid()<>c.caller_id or p_kind='answer' and(auth.uid()<>c.callee_id or c.status<>'connecting') then raise exception 'Not authorized'; end if;
 if p_kind in('offer','answer') and(coalesce(p_payload->>'sdp','') not like '%m=audio%' or p_payload->>'sdp' ~ 'm=(video|application)') then raise exception 'Audio calls only'; end if;
 if(select count(*) from public.job_call_signals where call_id=c.id and sender_id=auth.uid())>=150 then raise exception 'Signal limit reached'; end if;
 insert into public.job_call_signals(call_id,sender_id,kind,payload) values(c.id,auth.uid(),p_kind,p_payload);
end $$;
revoke all on function public.start_job_call(uuid),public.respond_job_call(uuid,text),public.send_job_call_signal(uuid,text,jsonb) from public,anon;
grant execute on function public.start_job_call(uuid),public.respond_job_call(uuid,text),public.send_job_call_signal(uuid,text,jsonb) to authenticated;
do $$ begin
 alter publication supabase_realtime add table public.job_calls;
 alter publication supabase_realtime add table public.job_call_signals;
end $$;
-- Expired signaling contains network connection metadata; retain it briefly only.
select cron.schedule('movezw-call-cleanup','17 * * * *',$cleanup$delete from public.job_calls where expires_at<now()-interval '1 day'; delete from public.job_ring_events where created_at<now()-interval '1 day';$cleanup$);
commit;
