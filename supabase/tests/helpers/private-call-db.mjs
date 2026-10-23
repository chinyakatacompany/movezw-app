import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function privateCallDatabase() {
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema vault; create schema net; create schema cron;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as 'select 1::bigint';
 create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
 create table profiles(id uuid primary key,full_name text,role text,is_suspended boolean default false,deleted_at timestamptz,created_at timestamptz default now());
 create function is_admin() returns boolean language sql security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
 create table driver_profiles(user_id uuid,verification_status text,vehicle_type text,created_at timestamptz default now());
 create table transport_requests(id uuid primary key,customer_id uuid,accepted_driver_id uuid,status text,cargo_type text default 'Furniture',accepted_offer_id uuid,accepted_price numeric);
 create table commission_config(wallet_paused boolean,rate numeric,low_balance_threshold numeric);
 insert into commission_config values(true,0.1,5);
 create table wallets(id uuid,user_id uuid,balance numeric,pending numeric,currency text,total_earned numeric,total_commission numeric,total_paid_out numeric);
 create table transactions(wallet_id uuid,user_id uuid,type text,amount numeric,direction text,status text,method text,gateway text,request_id uuid,note text);
 create table audit_logs(actor_id uuid,actor_name text,action text,entity_type text,entity_id uuid,details text,amount numeric);
 create table offers(id uuid primary key default gen_random_uuid(),request_id uuid,driver_id uuid,status text,price numeric,eta_minutes int,vehicle_type text);
 create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,link text,is_read boolean default false,created_at timestamptz default now());
 create table conversations(id uuid primary key default gen_random_uuid(),request_id uuid,customer_id uuid,driver_id uuid,last_message text);
 create table messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,sender_id uuid,text text);
 alter table notifications enable row level security;
 alter table conversations enable row level security;
 alter table messages enable row level security;
 grant select,insert,update on conversations,messages,notifications to authenticated;
 create policy existing_notifications on notifications for all to authenticated using(user_id=auth.uid()) with check(true);
 create policy existing_conversations on conversations for all to authenticated using(auth.uid() in(customer_id,driver_id) or is_admin()) with check(auth.uid() in(customer_id,driver_id));
 create policy existing_messages on messages for all to authenticated using(true) with check(sender_id=auth.uid());
 `);
 let sql = await readFile(new URL('../../migrations/20261023103823_registration_alerts_and_private_calls.sql', import.meta.url),'utf8');
 sql = sql.replace(/do \$\$ begin\s*alter publication[\s\S]*?end \$\$;/,'');
 await db.exec(sql);
 return db;
}
