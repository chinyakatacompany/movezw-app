begin;
alter table public.driver_profiles add column capacity_tonnes numeric check(capacity_tonnes>0 and capacity_tonnes<=1000);
alter table public.offers add column capacity_tonnes numeric check(capacity_tonnes>0 and capacity_tonnes<=1000);
update public.driver_profiles set capacity_tonnes=substring(vehicle_type::text from '([0-9]+(?:[.][0-9]+)?) *[Tt]on')::numeric where vehicle_type::text ~* '[0-9]+ *ton';
update public.offers set capacity_tonnes=substring(vehicle_type::text from '([0-9]+(?:[.][0-9]+)?) *[Tt]on')::numeric where vehicle_type::text ~* '[0-9]+ *ton';
create function public.snapshot_bid_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select coalesce(d.capacity_tonnes,substring(d.vehicle_type::text from '([0-9]+(?:[.][0-9]+)?) *[Tt]on')::numeric) into new.capacity_tonnes from public.driver_profiles d where d.user_id=new.driver_id order by d.created_at desc limit 1;
 return new;
end $$;
revoke all on function public.snapshot_bid_capacity() from public,anon,authenticated;
create trigger movezw_bid_capacity before insert or update of capacity_tonnes,driver_id on public.offers for each row execute function public.snapshot_bid_capacity();
create function public.notify_driver_bid_accepted() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='confirmed' and new.accepted_driver_id is not null and (new.accepted_driver_id is distinct from old.accepted_driver_id or new.status is distinct from old.status) then
  insert into public.notifications(user_id,type,title,message,link) values(new.accepted_driver_id,'offer_accepted','Your offer was accepted','The customer accepted your offer. Open the job for delivery details.','/driver/job/'||new.id);
 end if;
 return new;
end $$;
revoke all on function public.notify_driver_bid_accepted() from public,anon,authenticated;
create trigger movezw_driver_bid_accepted after update on public.transport_requests for each row execute function public.notify_driver_bid_accepted();
create function public.decline_job_bid(p_offer uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.offers; r public.transport_requests;
begin
 select * into o from public.offers where id=p_offer;
 select * into r from public.transport_requests where id=o.request_id for update;
 if auth.uid() is null or auth.uid() is distinct from r.customer_id or r.status<>'open' or o.status<>'pending' then raise exception 'Only the job owner can decline a pending offer'; end if;
 update public.offers set status='rejected' where id=o.id and status='pending';
end $$;
revoke all on function public.decline_job_bid(uuid) from public,anon;
grant execute on function public.decline_job_bid(uuid) to authenticated;
-- Longer attention rings end on acknowledgement, sender cancellation or timeout.
alter table public.job_ring_events add column notification_id uuid references public.notifications(id) on delete cascade;
alter table public.job_ring_events add column stopped_at timestamptz;
drop function public.ring_job_party(uuid,uuid);
create or replace function public.ring_job_party(p_request uuid,p_recipient uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.transport_requests; driver uuid; nid uuid; eid uuid:=gen_random_uuid();
begin
 if auth.uid() is null or auth.uid()=p_recipient then raise exception 'Not authorized'; end if;
 select * into r from public.transport_requests where id=p_request;
 driver:=case when auth.uid()=r.customer_id then p_recipient else auth.uid() end;
 if r.id is null or r.status<>'open' or not (r.customer_id in(auth.uid(),p_recipient)) or not exists(select 1 from public.offers o where o.request_id=r.id and o.driver_id=driver and o.status='pending') or not exists(select 1 from public.driver_profiles d join public.profiles p on p.id=d.user_id where d.user_id=driver and d.verification_status='approved' and not coalesce(p.is_suspended,false)) then raise exception 'A pending bid on this job is required'; end if;
 if exists(select 1 from public.profiles where id in(auth.uid(),p_recipient) and(is_suspended or deleted_at is not null)) then raise exception 'Account unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_recipient::text,0));
 if exists(select 1 from public.job_ring_events e join public.notifications n on n.id=e.notification_id where e.sender_id=auth.uid() and e.recipient_id=p_recipient and e.stopped_at is null and not n.is_read and e.created_at>now()-interval '3 minutes') then raise exception 'This person is already ringing'; end if;
 if exists(select 1 from public.job_ring_events where sender_id=auth.uid() and recipient_id=p_recipient and created_at>now()-interval '60 seconds') then raise exception 'Please wait a minute before ringing again'; end if;
 insert into public.notifications(user_id,type,title,message,link) values(p_recipient,'job_ring','Attention requested','Please review this transport job. Voice and chat unlock only after acceptance.',case when p_recipient=r.customer_id then '/customer/request/' else '/driver/job/' end||r.id) returning id into nid;
 insert into public.job_ring_events(id,request_id,sender_id,recipient_id,notification_id) values(eid,r.id,auth.uid(),p_recipient,nid);
 return eid;
end $$;
revoke all on function public.ring_job_party(uuid,uuid) from public,anon;
grant execute on function public.ring_job_party(uuid,uuid) to authenticated;
create function public.stop_job_ring(p_ring uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.job_ring_events where id=p_ring and sender_id=auth.uid()) then raise exception 'Not authorized'; end if;
 update public.job_ring_events set stopped_at=now() where id=p_ring;
 update public.notifications set is_read=true where id=(select notification_id from public.job_ring_events where id=p_ring);
end $$;
revoke all on function public.stop_job_ring(uuid) from public,anon;
grant execute on function public.stop_job_ring(uuid) to authenticated;
create function public.job_ring_active(p_ring uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.job_ring_events e join public.notifications n on n.id=e.notification_id where e.id=p_ring and e.sender_id=auth.uid() and e.stopped_at is null and not n.is_read and e.created_at>now()-interval '3 minutes');
$$;
revoke all on function public.job_ring_active(uuid) from public,anon;
grant execute on function public.job_ring_active(uuid) to authenticated;
alter table public.job_calls alter column expires_at set default now()+interval '3 minutes';
create or replace function public.start_job_call(p_request uuid) returns public.job_calls language plpgsql security definer set search_path='' as $$
declare r public.transport_requests; target uuid; c public.job_calls;
begin
 select * into r from public.transport_requests where id=p_request;
 if auth.uid() is null or auth.uid() not in(r.customer_id,r.accepted_driver_id) or not public.communication_pair_allowed(r.id,r.customer_id,r.accepted_driver_id) then raise exception 'Calls unlock only for the accepted job participants'; end if;
 target:=case when auth.uid()=r.customer_id then r.accepted_driver_id else r.customer_id end;
 if exists(select 1 from public.admin_call_members m join public.admin_call_rooms room on room.id=m.room_id where m.user_id in(auth.uid(),target) and m.state='joined' and room.ended_at is null and room.expires_at>now() and room.last_seen_at>now()-interval '45 seconds') then raise exception 'A participant is in a group call'; end if;
 if exists(select 1 from public.profiles where id in(auth.uid(),target) and(is_suspended or deleted_at is not null)) then raise exception 'Account unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(auth.uid()::text,target::text),0));
 perform pg_advisory_xact_lock(hashtextextended(greatest(auth.uid()::text,target::text),0));
 if exists(select 1 from public.job_calls where status in('ringing','connecting') and expires_at>now() and(caller_id in(auth.uid(),target) or callee_id in(auth.uid(),target))) then raise exception 'A participant is already on a call'; end if;
 insert into public.job_calls(request_id,caller_id,callee_id) values(r.id,auth.uid(),target) returning * into c;
 insert into public.notifications(user_id,type,title,message,link) values(target,'in_app_call','Incoming MoveZW call','Open MoveZW to answer the call for your accepted job.',case when target=r.customer_id then '/customer/request/' else '/driver/job/' end||r.id);
 return c;
end $$;

create table public.admin_call_rooms(id uuid primary key default gen_random_uuid(),host_id uuid not null references public.profiles(id),audience text not null check(audience in('driver','customer')),created_at timestamptz not null default now(),invite_until timestamptz not null default now()+interval '3 minutes',expires_at timestamptz not null default now()+interval '1 hour',last_seen_at timestamptz not null default now(),ended_at timestamptz);
create table public.admin_call_members(room_id uuid not null references public.admin_call_rooms(id) on delete cascade,user_id uuid not null references public.profiles(id),display_name text not null,state text not null default 'invited' check(state in('invited','joined','left','declined')),primary key(room_id,user_id));
create index on public.admin_call_rooms(host_id,expires_at);
create index on public.admin_call_members(user_id,state);
create table public.admin_call_signals(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.admin_call_rooms(id) on delete cascade,sender_id uuid not null references public.profiles(id),recipient_id uuid not null references public.profiles(id),kind text not null check(kind in('offer','answer','ice')),payload jsonb not null,created_at timestamptz not null default now());
create index on public.admin_call_signals(room_id,recipient_id,created_at,id);
create unique index on public.admin_call_signals(room_id,sender_id,recipient_id,kind) where kind in('offer','answer');
alter table public.admin_call_rooms enable row level security;
alter table public.admin_call_members enable row level security;
alter table public.admin_call_signals enable row level security;
revoke all on public.admin_call_rooms,public.admin_call_members,public.admin_call_signals from public,anon,authenticated;
grant select on public.admin_call_rooms,public.admin_call_members,public.admin_call_signals to authenticated;
grant all on public.admin_call_rooms,public.admin_call_members,public.admin_call_signals to service_role;
create function public.admin_group_access(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_call_rooms r join public.admin_call_members me on me.room_id=r.id and me.user_id=auth.uid() join public.admin_call_members host on host.room_id=r.id and host.user_id=r.host_id join public.profiles hp on hp.id=r.host_id join public.profiles mp on mp.id=me.user_id where r.id=p_room and r.ended_at is null and r.expires_at>now() and me.state in('invited','joined') and (me.state='joined' or r.invite_until>now()) and hp.role='admin' and not coalesce(hp.is_suspended,false) and hp.deleted_at is null and not coalesce(mp.is_suspended,false) and mp.deleted_at is null and ((host.state='invited' and r.invite_until>now()) or (host.state='joined' and r.last_seen_at>now()-interval '45 seconds')));
$$;
revoke all on function public.admin_group_access(uuid) from public,anon;
grant execute on function public.admin_group_access(uuid) to authenticated,service_role;
create policy group_room_read on public.admin_call_rooms for select to authenticated using(public.admin_group_access(id));
create policy group_member_read on public.admin_call_members for select to authenticated using(public.admin_group_access(room_id));
create policy group_signal_read on public.admin_call_signals for select to authenticated using(recipient_id=auth.uid() and public.admin_group_access(room_id));
create function public.start_admin_group(p_users uuid[],p_audience text) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; recipients uuid[];
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not coalesce(is_suspended,false) and deleted_at is null) then raise exception 'Active administrator required'; end if;
 select array_agg(distinct x) into recipients from unnest(p_users) x;
 if coalesce(cardinality(recipients),0) not between 1 and 5 or p_audience not in('driver','customer') then raise exception 'Choose one to five drivers or customers'; end if;
 if (select count(*) from public.profiles where id=any(recipients) and role::text=p_audience and not coalesce(is_suspended,false) and deleted_at is null)<>cardinality(recipients) then raise exception 'Recipients must be active users of the selected role'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.admin_call_rooms r join public.admin_call_members m on m.room_id=r.id where m.user_id=auth.uid() and m.state in('joined','invited') and r.ended_at is null and r.expires_at>now() and ((m.state='invited' and r.invite_until>now()) or r.last_seen_at>now()-interval '45 seconds')) then raise exception 'Finish the current group call first'; end if;
 insert into public.admin_call_rooms(host_id,audience) values(auth.uid(),p_audience) returning id into rid;
 insert into public.admin_call_members(room_id,user_id,display_name) select rid,id,coalesce(nullif(full_name,''),case when role='admin' then 'MoveZW Admin' else 'Participant' end) from public.profiles where id=any(recipients) or id=auth.uid();
 insert into public.notifications(user_id,type,title,message,link) select id,'admin_group_call','MoveZW group call','An administrator invited you to a group audio call. Open MoveZW to join or decline.',case when role='driver' then '/driver' else '/customer' end||'?group='||rid from public.profiles where id=any(recipients);
 return rid;
end $$;
create function public.respond_admin_group(p_room uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare r public.admin_call_rooms;
begin
 select * into r from public.admin_call_rooms where id=p_room for update;
 if auth.uid() is null or not exists(select 1 from public.admin_call_members where room_id=r.id and user_id=auth.uid()) then raise exception 'Not invited'; end if;
 if p_action='join' then
  if not public.admin_group_access(r.id) then raise exception 'Invitation expired'; end if;
  if exists(select 1 from public.job_calls where status in('ringing','connecting') and expires_at>now() and auth.uid() in(caller_id,callee_id)) then raise exception 'Finish your job call first'; end if;
  if exists(select 1 from public.admin_call_members m join public.admin_call_rooms other on other.id=m.room_id where m.user_id=auth.uid() and m.room_id<>r.id and m.state='joined' and other.ended_at is null and other.expires_at>now() and other.last_seen_at>now()-interval '45 seconds') then raise exception 'Finish your other group call first'; end if;
  update public.admin_call_members set state='joined' where room_id=r.id and user_id=auth.uid() and state in('joined','invited');
  if r.host_id=auth.uid() then update public.admin_call_rooms set last_seen_at=now() where id=r.id; end if;
 elsif p_action in('leave','decline') then
  update public.admin_call_members set state=case when p_action='decline' then 'declined' else 'left' end where room_id=r.id and user_id=auth.uid();
  if r.host_id=auth.uid() then update public.admin_call_rooms set ended_at=now() where id=r.id; end if;
 elsif p_action='heartbeat' and r.host_id=auth.uid() and public.admin_group_access(r.id) then update public.admin_call_rooms set last_seen_at=now() where id=r.id;
 else raise exception 'Invalid group action'; end if;
 if p_action<>'heartbeat' then update public.notifications set is_read=true where type='admin_group_call' and link like '%?group='||r.id and (user_id=auth.uid() or (r.host_id=auth.uid() and p_action in('leave','decline'))); end if;
end $$;
create function public.send_admin_group_signal(p_room uuid,p_recipient uuid,p_kind text,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.admin_group_access(p_room) or auth.uid()=p_recipient or (select count(*) from public.admin_call_members where room_id=p_room and user_id in(auth.uid(),p_recipient) and state='joined')<>2 or not exists(select 1 from public.admin_call_rooms r join public.admin_call_members h on h.room_id=r.id and h.user_id=r.host_id where r.id=p_room and h.state='joined') then raise exception 'Joined group participants required'; end if;
 if p_kind not in('offer','answer','ice') or p_payload is null or octet_length(p_payload::text)>65536 then raise exception 'Invalid signal'; end if;
 if p_kind='offer' and auth.uid()::text>p_recipient::text or p_kind='answer' and auth.uid()::text<p_recipient::text then raise exception 'Invalid negotiation direction'; end if;
 if p_kind in('offer','answer') and(coalesce(p_payload->>'sdp','') not like '%m=audio%' or p_payload->>'sdp' ~ 'm=(video|application)') then raise exception 'Audio only'; end if;
 if(select count(*) from public.admin_call_signals where room_id=p_room and sender_id=auth.uid() and recipient_id=p_recipient)>=200 then raise exception 'Signal limit reached'; end if;
 insert into public.admin_call_signals(room_id,sender_id,recipient_id,kind,payload) values(p_room,auth.uid(),p_recipient,p_kind,p_payload) on conflict do nothing;
end $$;
revoke all on function public.start_admin_group(uuid[],text),public.respond_admin_group(uuid,text),public.send_admin_group_signal(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.start_admin_group(uuid[],text),public.respond_admin_group(uuid,text),public.send_admin_group_signal(uuid,uuid,text,jsonb) to authenticated;
drop policy movezw_server_alerts_only on public.notifications;
create policy movezw_server_alerts_only on public.notifications as restrictive for insert to authenticated with check(type not in('driver_registered','new_offer','job_ring','in_app_call','admin_group_call','offer_accepted'));
create or replace function public.enqueue_app_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.type in ('driver_registered','new_offer','job_ring','in_app_call','admin_group_call','offer_accepted') then
  insert into public.app_push_outbox(notification_id) values(new.id) on conflict do nothing;
  begin perform public.dispatch_app_push(); exception when others then raise warning 'App push deferred to cron'; end;
 end if; return new;
end $$;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='driver_profiles') then alter publication supabase_realtime add table public.driver_profiles; end if;
 alter publication supabase_realtime add table public.admin_call_rooms;
 alter publication supabase_realtime add table public.admin_call_members;
end $$;
select cron.schedule('movezw-admin-group-cleanup','27 * * * *',$cleanup$delete from public.admin_call_rooms where expires_at<now()-interval '1 day';$cleanup$);
CREATE OR REPLACE FUNCTION public.fn_accept_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_offer offers;
  v_request transport_requests;
  v_cfg commission_config;
  v_wallet wallets;
  v_commission numeric := 0;
begin
  select * into v_offer from offers where id = p_offer_id;
  if v_offer.id is null then raise exception 'Offer not found'; end if;
  if v_offer.status is distinct from 'pending' then
    raise exception 'This offer is no longer available';
  end if;

  select * into v_request from transport_requests where id = v_offer.request_id for update;
  if v_request.id is null then raise exception 'Request not found'; end if;

  if v_request.customer_id is distinct from auth.uid() and not is_admin() then
    raise exception 'Not authorized';
  end if;

  if v_request.status is distinct from 'open' then
    raise exception 'This request is no longer open';
  end if;

  -- Recheck after the request lock: a competing decline/accept may have won.
  select * into v_offer from offers where id = p_offer_id for update;
  if v_offer.status is distinct from 'pending' then raise exception 'This offer is no longer available'; end if;

  select * into v_cfg from commission_config limit 1;

  if not coalesce(v_cfg.wallet_paused, false) then
    v_commission := round(coalesce(v_offer.price, 0) * coalesce(v_cfg.rate, 0.1), 2);
    if v_commission > 0 then
      select * into v_wallet from wallets where user_id = v_offer.driver_id limit 1 for update;
      if v_wallet.id is null then
        insert into wallets (user_id, balance, pending, currency, total_earned, total_commission, total_paid_out)
        values (v_offer.driver_id, 0, 0, 'USD', 0, 0, 0)
        returning * into v_wallet;
      end if;

      if coalesce(v_wallet.balance, 0) < coalesce(v_cfg.low_balance_threshold, 5) then
        raise exception 'This driver''s wallet balance is too low to accept new jobs right now.';
      end if;
      insert into transactions (wallet_id, user_id, type, amount, direction, status, method, gateway, request_id, note)
      values (v_wallet.id, v_offer.driver_id, 'commission', v_commission, 'out', 'completed', 'wallet', 'platform', v_request.id,
              'Commission (' || round(coalesce(v_cfg.rate, 0.1) * 100) || '%) reserved on acceptance for ' || coalesce(v_request.cargo_type::text, 'delivery'));
      update wallets
      set balance = round(coalesce(balance, 0) - v_commission, 2),
          total_commission = round(coalesce(total_commission, 0) + v_commission, 2)
      where id = v_wallet.id;
    end if;
  end if;

  update transport_requests
  set status = 'confirmed', accepted_offer_id = v_offer.id, accepted_driver_id = v_offer.driver_id, accepted_price = v_offer.price
  where id = v_request.id;

  update offers set status = 'rejected' where request_id = v_request.id and status = 'pending';
  update offers set status = 'accepted' where id = v_offer.id;

  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, details, amount)
  values (auth.uid(), 'Customer', 'offer_accepted', 'transport_request', v_request.id,
          'Offer accepted' || (case when v_commission > 0 then '; $' || v_commission || ' commission reserved from driver wallet.' else '.' end), v_commission);

  return jsonb_build_object('commission', v_commission);
end;
$function$;
commit;
