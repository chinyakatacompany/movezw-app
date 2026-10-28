-- Referral rewards are commission credit, never withdrawable earnings.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter table public.wallets add column referral_credit numeric(14,2) not null default 0 check (referral_credit >= 0 and referral_credit <= greatest(coalesce(balance,0),0));
alter table public.transactions add column referral_credit_amount numeric(14,2) not null default 0 check (referral_credit_amount >= 0);
create table public.driver_referral_settings (
 id boolean primary key default true check(id), enabled boolean not null default true, reward_amount numeric(10,2) not null default 0.50 check(reward_amount>0),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id) on delete set null
);
insert into public.driver_referral_settings(id) values(true);
alter table public.driver_referral_settings enable row level security;
revoke all on public.driver_referral_settings from public,anon,authenticated;
grant select(enabled,reward_amount) on public.driver_referral_settings to anon,authenticated;
create policy referral_settings_read on public.driver_referral_settings for select to anon,authenticated using(true);
create table public.driver_referral_codes (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 code text not null unique check (code ~ '^MZW[A-F0-9]{12}$'), created_at timestamptz not null default now()
);
alter table public.driver_referral_codes enable row level security;
revoke all on public.driver_referral_codes from public,anon,authenticated;
grant select on public.driver_referral_codes to authenticated;
create policy referral_codes_read on public.driver_referral_codes for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create table public.driver_referrals (
 id uuid primary key default gen_random_uuid(),
 referrer_id uuid references public.profiles(id) on delete set null,
 referred_id uuid unique references public.profiles(id) on delete set null,
 signup_phone_hash text not null unique,
 reward_amount numeric(10,2) not null default 0.50 check(reward_amount>0),
 reward_transaction_id uuid unique references public.transactions(id) on delete set null,
 created_at timestamptz not null default now(), rewarded_at timestamptz,
 admin_approved_at timestamptz, admin_approved_by uuid references public.profiles(id) on delete set null, ready_notified_at timestamptz,
 check(referrer_id is null or referred_id is null or referrer_id<>referred_id)
);
create index driver_referrals_referrer_idx on public.driver_referrals(referrer_id,created_at desc);
alter table public.driver_referrals enable row level security;
revoke all on public.driver_referrals from public,anon,authenticated;
grant select on public.driver_referrals to authenticated;
create policy referrals_admin_read on public.driver_referrals for select to authenticated using(public.is_admin());
-- Drivers receive only their own aggregate summary through a checked RPC.
create function private.referral_phone(p_phone text) returns text language sql immutable set search_path='' as $$
 select case when length(digits)=12 and left(digits,3)='263' then right(digits,9)
 when length(digits)=10 and left(digits,1)='0' then right(digits,9) else digits end
 from (select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') as digits) s;
$$;
revoke all on function private.referral_phone(text) from public,anon,authenticated;
-- Deliberately anonymous, boolean-only validation of a shareable public code.
-- Cannot issue credit or disclose the code owner's information.
create function private.valid_driver_referral_code(p_code text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.driver_referral_settings s join public.driver_referral_codes c on c.code=upper(trim(p_code))
 join public.profiles p on p.id=c.user_id where s.enabled and p.role='driver' and not coalesce(p.is_suspended,false) and p.deleted_at is null);
$$;
revoke all on function private.valid_driver_referral_code(text) from public,anon,authenticated;
grant execute on function private.valid_driver_referral_code(text) to anon,authenticated;
create function public.valid_driver_referral_code(p_code text) returns boolean language sql security invoker set search_path='' as $$ select private.valid_driver_referral_code(p_code); $$;
revoke all on function public.valid_driver_referral_code(text) from public,anon,authenticated;
grant execute on function public.valid_driver_referral_code(text) to anon,authenticated;
create function private.referral_is_eligible(p_referred uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.driver_referrals r
 join public.profiles p on p.id=r.referred_id join auth.users u on u.id=p.id
 join public.profiles a on a.id=r.referrer_id
 where r.referred_id=p_referred and p.role='driver' and not coalesce(p.is_suspended,false) and p.deleted_at is null
 and u.email_confirmed_at is not null and a.role='driver' and not coalesce(a.is_suspended,false) and a.deleted_at is null
 and private.referral_phone(a.phone)<>private.referral_phone(p.phone)
 and exists(select 1 from public.driver_profiles d where d.user_id=p_referred and d.verification_status='approved'
 and nullif(trim(d.national_id_url),'') is not null and nullif(trim(d.driver_licence_url),'') is not null and nullif(trim(d.vehicle_registration_url),'') is not null));
$$;
revoke all on function private.referral_is_eligible(uuid) from public,anon,authenticated;
create function private.award_driver_referral(p_referred uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.driver_referrals; w public.wallets; tx uuid;
begin
 if not coalesce((select enabled from public.driver_referral_settings where id for share),false) then return; end if;
 select * into r from public.driver_referrals where referred_id=p_referred for update;
 if r.id is null or r.rewarded_at is not null or r.referrer_id is null then return; end if;
 if not private.referral_is_eligible(p_referred) then return; end if;
 if r.admin_approved_at is null then
  if r.ready_notified_at is null then
   update public.driver_referrals set ready_notified_at=now() where id=r.id;
   insert into public.notifications(user_id,type,title,message,link)
   select id,'referral_review','Referral reward ready for approval','A referred driver is fully verified. Review and approve their referral wallet top-up.','/admin/referrals'
   from public.profiles where role='admin' and not coalesce(is_suspended,false) and deleted_at is null;
  end if;
  return;
 end if;
 insert into public.wallets(user_id,balance,pending,currency,total_earned,total_commission,total_paid_out)
 values(r.referrer_id,0,0,'USD',0,0,0) on conflict(user_id) do nothing;
 select * into w from public.wallets where user_id=r.referrer_id for update;
 insert into public.transactions(wallet_id,user_id,type,amount,direction,status,method,gateway,reference,note,referral_credit_amount)
 values(w.id,r.referrer_id,'topup',r.reward_amount,'in','completed','referral','referral_program','REF-'||r.id,'Driver referral reward: commission credit, not withdrawable.',r.reward_amount) returning id into tx;
 update public.wallets set balance=round(coalesce(balance,0)+r.reward_amount,2),referral_credit=least(referral_credit+r.reward_amount,greatest(round(coalesce(balance,0)+r.reward_amount,2),0)) where id=w.id;
 update public.driver_referrals set reward_transaction_id=tx,rewarded_at=now() where id=r.id;
 insert into public.notifications(user_id,type,title,message,link) values(r.referrer_id,'referral_reward','Referral reward: +$'||to_char(r.reward_amount,'FM999999990.00'),'Admin approved your referral reward. $'||to_char(r.reward_amount,'FM999999990.00')||' was added to your commission balance for MoveZW deductions.','/driver/referrals');
end $$;
revoke all on function private.award_driver_referral(uuid) from public,anon,authenticated;
create function private.capture_driver_referral() returns trigger language plpgsql security definer set search_path='' as $$
declare referral_code text; referrer uuid; signup_phone text;
begin
 if not coalesce((select enabled from public.driver_referral_settings where id for share),false) then return new; end if;
 if not exists(select 1 from public.profiles where id=new.id and role='driver') then return new; end if;
 referral_code:=upper(trim(coalesce(new.raw_user_meta_data->>'driver_referral_code','')));
 if referral_code='' then return new; end if;
 select c.user_id into referrer from public.driver_referral_codes c join public.profiles p on p.id=c.user_id where c.code=referral_code and p.role='driver' and not coalesce(p.is_suspended,false) and p.deleted_at is null;
 if referrer is null or referrer=new.id then return new; end if;
 signup_phone:=private.referral_phone(new.raw_user_meta_data->>'phone');
 if length(signup_phone)<9 or exists(select 1 from public.profiles p where p.id=referrer and private.referral_phone(p.phone)=signup_phone) then return new; end if;
 insert into public.driver_referrals(referrer_id,referred_id,signup_phone_hash) values(referrer,new.id,encode(sha256(convert_to(signup_phone,'UTF8')),'hex')) on conflict do nothing;
 return new;
end $$;
revoke all on function private.capture_driver_referral() from public,anon,authenticated;
-- Runs after on_auth_user_created has created the app profile.
create trigger zz_movezw_capture_referral after insert on auth.users for each row execute function private.capture_driver_referral();
create function private.driver_referral_verified() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.award_driver_referral(new.user_id); return new; end $$;
revoke all on function private.driver_referral_verified() from public,anon,authenticated;
create trigger movezw_referral_documents after insert or update of verification_status,national_id_url,driver_licence_url,vehicle_registration_url on public.driver_profiles for each row execute function private.driver_referral_verified();
create function private.driver_referral_email() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.email_confirmed_at is not null then perform private.award_driver_referral(new.id); end if; return new; end $$;
revoke all on function private.driver_referral_email() from public,anon,authenticated;
create trigger movezw_referral_email after update of email_confirmed_at on auth.users for each row execute function private.driver_referral_email();
create function private.my_driver_referrals() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); code text; target record;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='driver' and not coalesce(is_suspended,false) and deleted_at is null) then raise exception 'Active driver access required'; end if;
 insert into public.driver_referral_codes(user_id,code) values(uid,'MZW'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) on conflict(user_id) do nothing;
 select c.code into code from public.driver_referral_codes c where c.user_id=uid;
 for target in select referred_id from public.driver_referrals where referrer_id=uid and rewarded_at is null and referred_id is not null loop perform private.award_driver_referral(target.referred_id); end loop;
 return jsonb_build_object('code',code,'enabled',(select enabled from public.driver_referral_settings where id),'reward_amount',(select reward_amount from public.driver_referral_settings where id),
 'registered',(select count(*) from public.driver_referrals where referrer_id=uid),
 'rewarded',(select count(*) from public.driver_referrals where referrer_id=uid and rewarded_at is not null),
 'earned',(select coalesce(sum(reward_amount),0) from public.driver_referrals where referrer_id=uid and rewarded_at is not null));
end $$;
revoke all on function private.my_driver_referrals() from public,anon,authenticated;
grant execute on function private.my_driver_referrals() to authenticated;
create function public.my_driver_referrals() returns jsonb language sql security invoker set search_path='' as $$ select private.my_driver_referrals(); $$;
revoke all on function public.my_driver_referrals() from public,anon,authenticated;
grant execute on function public.my_driver_referrals() to authenticated;
create function private.admin_driver_referrals(p_enabled boolean default null,p_referral_id uuid default null,p_amount numeric default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare target record; selected_referral public.driver_referrals; current_amount numeric;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and not coalesce(is_suspended,false) and deleted_at is null) then raise exception 'Administrator access required'; end if;
 if p_amount is not null and p_referral_id is null then
  if p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>99999999.99 or round(p_amount,2)<>p_amount then raise exception 'Enter a positive referral amount with at most two decimal places'; end if;
  update public.driver_referral_settings set reward_amount=p_amount,updated_at=now(),updated_by=auth.uid() where id;
 end if;
 if p_enabled is not null then
  update public.driver_referral_settings set enabled=p_enabled,updated_at=now(),updated_by=auth.uid() where id;
  if p_enabled then for target in select referred_id from public.driver_referrals where rewarded_at is null and referred_id is not null loop perform private.award_driver_referral(target.referred_id); end loop; end if;
 end if;
 if p_referral_id is not null then
  if not coalesce((select enabled from public.driver_referral_settings where id for share),false) then raise exception 'Referrals are paused'; end if;
  select reward_amount into current_amount from public.driver_referral_settings where id;
  if p_amount is distinct from current_amount then raise exception 'Referral amount changed. Refresh before approving this wallet top-up'; end if;
  select * into selected_referral from public.driver_referrals where id=p_referral_id for update;
  if selected_referral.id is null then raise exception 'Referral not found'; end if;
  if selected_referral.rewarded_at is null then
   if not private.referral_is_eligible(selected_referral.referred_id) then raise exception 'Driver email and all documents must be fully verified before approving this reward'; end if;
   update public.driver_referrals set admin_approved_at=now(),admin_approved_by=auth.uid(),reward_amount=current_amount where id=selected_referral.id;
   perform private.award_driver_referral(selected_referral.referred_id);
  end if;
 end if;
 return jsonb_build_object('enabled',(select enabled from public.driver_referral_settings where id),'reward_amount',(select reward_amount from public.driver_referral_settings where id),
 'registered',(select count(*) from public.driver_referrals),'rewarded',(select count(*) from public.driver_referrals where rewarded_at is not null),
 'earned',(select coalesce(sum(reward_amount),0) from public.driver_referrals where rewarded_at is not null),
 'recent',(select coalesce(jsonb_agg(row_data order by ready desc,created_at desc),'[]'::jsonb) from (
 select r.created_at,(r.rewarded_at is null and private.referral_is_eligible(r.referred_id)) as ready,jsonb_build_object('id',r.id,'referrer',coalesce(a.full_name,'Deleted account'),'driver',coalesce(b.full_name,'Deleted account'),'created_at',r.created_at,'rewarded_at',r.rewarded_at,'amount',case when r.rewarded_at is not null then r.reward_amount else (select reward_amount from public.driver_referral_settings where id) end,'eligible',private.referral_is_eligible(r.referred_id)) as row_data
 from public.driver_referrals r left join public.profiles a on a.id=r.referrer_id left join public.profiles b on b.id=r.referred_id order by (r.rewarded_at is null and private.referral_is_eligible(r.referred_id)) desc,r.created_at desc limit 200) recent));
end $$;
revoke all on function private.admin_driver_referrals(boolean,uuid,numeric) from public,anon,authenticated;
grant execute on function private.admin_driver_referrals(boolean,uuid,numeric) to authenticated;
create function public.admin_driver_referrals(p_enabled boolean default null,p_referral_id uuid default null,p_amount numeric default null) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_driver_referrals(p_enabled,p_referral_id,p_amount); $$;
revoke all on function public.admin_driver_referrals(boolean,uuid,numeric) from public,anon,authenticated;
grant execute on function public.admin_driver_referrals(boolean,uuid,numeric) to authenticated;
create policy referral_alerts_server_only on public.notifications as restrictive for insert to authenticated with check(type not in ('referral_reward','referral_review'));

-- Consume referral credit first for fees; preserve its restriction on refunds.
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
      insert into transactions (wallet_id, user_id, type, amount, direction, status, method, gateway, request_id, note, referral_credit_amount)
      values (v_wallet.id, v_offer.driver_id, 'commission', v_commission, 'out', 'completed', 'wallet', 'platform', v_request.id,
              'Commission (' || round(coalesce(v_cfg.rate, 0.1) * 100) || '%) reserved on acceptance for ' || coalesce(v_request.cargo_type::text, 'delivery'), least(v_wallet.referral_credit,v_commission));
      update wallets
      set balance = round(coalesce(balance, 0) - v_commission, 2),
          referral_credit = greatest(0,referral_credit-v_commission),
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
$function$
;
CREATE OR REPLACE FUNCTION public.fn_cancel_transport_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request transport_requests;
  v_commission_txn transactions;
  v_wallet wallets;
  v_existing_refund refund_requests;
  v_rr refund_requests;
  v_pre_collection boolean;
begin
  select * into v_request from transport_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'Request not found'; end if;

  if v_request.customer_id is distinct from auth.uid() and not is_admin() then
    raise exception 'Not authorized';
  end if;

  if v_request.status in ('completed', 'cancelled') then
    raise exception 'This request cannot be cancelled';
  end if;

  v_pre_collection := v_request.status in ('open', 'confirmed', 'en_route_pickup');

  update transport_requests set status = 'cancelled' where id = p_request_id;

  if v_request.accepted_driver_id is null then
    return jsonb_build_object('refund', 'none');
  end if;

  select * into v_commission_txn from transactions
    where request_id = p_request_id and type = 'commission'
    order by created_at desc limit 1;
  if v_commission_txn.id is null then
    return jsonb_build_object('refund', 'none');
  end if;

  select * into v_wallet from wallets where user_id = v_request.accepted_driver_id limit 1 for update;
  if v_wallet.id is null then
    insert into wallets (user_id, balance, pending, currency, total_earned, total_commission, total_paid_out)
    values (v_request.accepted_driver_id, 0, 0, 'USD', 0, 0, 0)
    returning * into v_wallet;
  end if;

  if v_pre_collection then
    insert into transactions (wallet_id, user_id, type, amount, direction, status, method, gateway, request_id, note)
    values (v_wallet.id, v_request.accepted_driver_id, 'refund', v_commission_txn.amount, 'in', 'completed', 'wallet', 'platform', p_request_id,
            'Commission refunded — request cancelled before pickup');
    update wallets
    set balance = round(coalesce(balance, 0) + v_commission_txn.amount, 2),
        referral_credit = least(greatest(coalesce(balance,0)+v_commission_txn.amount,0),referral_credit + v_commission_txn.referral_credit_amount),
        total_commission = round(coalesce(total_commission, 0) - v_commission_txn.amount, 2)
    where id = v_wallet.id;

    insert into notifications (user_id, type, title, message, link)
    values (v_request.accepted_driver_id, 'admin', 'Commission refunded 💰',
            'The customer cancelled before pickup — your $' || v_commission_txn.amount || ' commission was refunded to your wallet.', '/wallet');

    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, details, amount)
    values (auth.uid(), 'Customer', 'cancellation_auto_refund', 'transport_request', p_request_id,
            'Auto-refunded $' || v_commission_txn.amount || ' commission (cancelled before pickup)', v_commission_txn.amount);

    return jsonb_build_object('refund', 'auto', 'amount', v_commission_txn.amount);
  else
    select * into v_existing_refund from refund_requests
      where request_id = p_request_id and status in ('pending', 'approved')
      order by requested_at desc limit 1;
    if v_existing_refund.id is not null then
      return jsonb_build_object('refund', 'pending', 'alreadyExists', true, 'refundRequestId', v_existing_refund.id);
    end if;

    insert into refund_requests (request_id, driver_id, wallet_id, amount, reason, status, requested_at)
    values (p_request_id, v_request.accepted_driver_id, v_wallet.id, v_commission_txn.amount,
            'Cancellation after pickup (' || v_request.status || '). Requires admin approval.', 'pending', now())
    returning * into v_rr;

    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, details, amount)
    values (auth.uid(), 'Customer', 'refund_requested', 'transport_request', p_request_id,
            'Refund of $' || v_commission_txn.amount || ' requested (cancelled after pickup)', v_commission_txn.amount);

    insert into notifications (user_id, type, title, message, link)
    values (v_request.accepted_driver_id, 'admin', 'Refund request submitted',
            'A commission refund of $' || v_commission_txn.amount || ' for your cancelled job is pending admin approval.', '/wallet');

    return jsonb_build_object('refund', 'pending', 'refundRequestId', v_rr.id);
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_claim_refund(p_refund_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rr refund_requests;
  v_wallet wallets;
  v_invoice text;
begin
  select * into v_rr from refund_requests where id = p_refund_request_id for update;
  if v_rr.id is null then raise exception 'Refund request not found'; end if;
  if v_rr.driver_id is distinct from auth.uid() then raise exception 'This refund does not belong to you'; end if;
  if v_rr.status != 'approved' then raise exception 'Refund is not approved'; end if;

  v_wallet := fn_ensure_wallet(auth.uid());
  perform 1 from wallets where id=v_wallet.id for update;
  v_invoice := generate_invoice_number();

  insert into transactions (wallet_id, user_id, type, amount, direction, status, method, gateway, reference, request_id, note)
  values (v_wallet.id, auth.uid(), 'refund', v_rr.amount, 'in', 'completed', 'wallet', 'platform', v_invoice, v_rr.request_id, 'Commission refunded (admin approved)');

  update wallets set balance = round(coalesce(balance,0) + v_rr.amount, 2),
      referral_credit = least(greatest(coalesce(balance,0)+v_rr.amount,0),referral_credit + least(v_rr.amount,coalesce((select referral_credit_amount from transactions where request_id=v_rr.request_id and type='commission' order by created_at desc limit 1),0)))
  where id = v_wallet.id;

  update refund_requests
  set status = 'paid', admin_note = trim(both ' ' from coalesce(admin_note,'') || ' | Claimed by driver.')
  where id = p_refund_request_id;

  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, details, reference, amount)
  values (auth.uid(), 'Driver', 'refund_claimed', 'refund_request', v_rr.id, 'Driver claimed refund of $' || v_rr.amount || ' for job ' || v_rr.request_id, v_invoice, v_rr.amount);

  insert into notifications (user_id, type, title, message, link)
  values (auth.uid(), 'admin', 'Refund claimed 💸', '$' || v_rr.amount || ' refunded to your commission balance.', '/wallet');

  return jsonb_build_object('refundAmt', v_rr.amount);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_request_payout(p_amount numeric, p_method text, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg commission_config;
  v_wallet wallets;
  v_amt numeric;
  v_invoice text;
  v_tx transactions;
  v_payout payouts;
begin
  select * into v_cfg from commission_config limit 1;
  if v_cfg.wallet_paused then
    raise exception 'Payouts are paused during the testing period.';
  end if;

  v_wallet := fn_ensure_wallet(auth.uid());
  select * into v_wallet from wallets where id=v_wallet.id for update;
  v_amt := round(p_amount, 2);
  if v_amt is null or v_amt::text in ('NaN','Infinity','-Infinity') or v_amt <= 0 then raise exception 'Enter a valid amount'; end if;
  if v_amt > coalesce(v_wallet.balance,0)-v_wallet.referral_credit then raise exception 'Referral credit is for MoveZW deductions and cannot be withdrawn. Amount exceeds withdrawable balance.'; end if;

  v_invoice := generate_invoice_number();

  insert into transactions (wallet_id, user_id, type, amount, direction, status, method, gateway, reference, gateway_ref, note)
  values (v_wallet.id, auth.uid(), 'payout', v_amt, 'out', 'completed', p_method, 'manual', v_invoice, 'SIM-' || v_invoice, 'Payout to ' || coalesce(p_destination, p_method))
  returning * into v_tx;

  insert into payouts (driver_id, wallet_id, amount, status, method, destination, transaction_id, gateway_ref, processed_at)
  values (auth.uid(), v_wallet.id, v_amt, 'completed', p_method, p_destination, v_tx.id, 'SIM-' || v_invoice, now())
  returning * into v_payout;

  update wallets
  set balance = round(balance - v_amt, 2),
      total_paid_out = round(coalesce(total_paid_out,0) + v_amt, 2)
  where id = v_wallet.id;

  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, details, reference, amount)
  values (auth.uid(), 'Driver', 'payout_completed', 'payout', v_payout.id, 'Payout of $' || v_amt || ' to ' || p_method || ' completed', v_invoice, v_amt);

  insert into notifications (user_id, type, title, message, link)
  values (auth.uid(), 'admin', 'Payout sent 💸', '$' || v_amt || ' sent to ' || p_method || '. Ref: ' || v_invoice, '/wallet');

  return jsonb_build_object('payout', to_jsonb(v_payout), 'tx', to_jsonb(v_tx));
end;
$function$
;
