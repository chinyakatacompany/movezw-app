import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('every new open job alerts active admins and queues push without changing driver recipients', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table profiles(id uuid primary key,role text,is_suspended boolean default false,deleted_at timestamptz);
      create table transport_requests(id uuid primary key,status text,cargo_type text,pickup_location text,destination text);
      create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,message text,link text);
      create table app_push_outbox(notification_id uuid primary key);
      create function dispatch_app_push() returns void language plpgsql as $$begin return; end$$;
      alter table notifications enable row level security;
      grant usage on schema public to authenticated;
      grant insert,select on notifications to authenticated;
      create policy legacy_insert on notifications for insert to authenticated with check(true);
      create policy own_read on notifications for select to authenticated using(true);
    `);
    const sql = await readFile(new URL('../migrations/20261105083456_admin_job_notifications.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec('create trigger app_push after insert on notifications for each row execute function enqueue_app_push()');
    const ids = Array.from({length:6}, (_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
    for (const [i,role,suspended,deleted] of [[0,'admin',false,null],[1,'admin',false,null],[2,'admin',true,null],[3,'admin',false,'2026-01-01'],[4,'driver',false,null],[5,'customer',false,null]]) {
      await db.query('insert into profiles values($1,$2,$3,$4)',[ids[i],role,suspended,deleted]);
    }
    const job='00000000-0000-4000-9000-000000000001';
    await db.query("insert into transport_requests values($1,'open','Furniture','Harare','Gweru')",[job]);
    const alerts=(await db.query('select * from notifications order by user_id')).rows;
    assert.deepEqual(alerts.map(x=>x.user_id),ids.slice(0,2));
    assert.equal(alerts[0].link,`/admin/jobs?request=${job}`);
    assert.equal(alerts[0].message,'Furniture · Harare → Gweru');
    assert.equal((await db.query('select * from app_push_outbox')).rows.length,2);
    await db.exec("insert into transport_requests(id,status) values(gen_random_uuid(),'cancelled'); update transport_requests set destination='Bulawayo'");
    assert.equal((await db.query('select * from notifications')).rows.length,2,'closed inserts and later edits do not duplicate job alerts');
    await db.exec('set role authenticated');
    await assert.rejects(db.query("insert into notifications(user_id,type) values($1,'admin_new_job')",[ids[0]]),/row-level security/);
    await db.exec('reset role');
    // Existing app event types still pass through the same outbox trigger.
    for (const type of ['driver_registered','new_offer','job_ring','in_app_call','admin_group_call','offer_accepted']) {
      await db.query('insert into notifications(user_id,type) values($1,$2)',[ids[0],type]);
    }
    assert.equal((await db.query('select * from app_push_outbox')).rows.length,8);
    assert.equal((await db.query("select has_function_privilege('authenticated','enqueue_admin_job_alerts()','execute') allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
