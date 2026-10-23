import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { getServiceRoleKey, initWebPush, sendPushToUsers } from '../_shared/push.ts';
import { verifyNativePushConfiguration, sendNativePushToUsers } from '../_shared/nativePush.ts';
const keys = initWebPush();
Deno.serve(async (req) => {
 const db = createClient(Deno.env.get('SUPABASE_URL')!,getServiceRoleKey());
 const token=req.headers.get('x-movezw-job-token');
 if(req.method!=='POST'||!token) return Response.json({error:'Unauthorized'},{status:401});
 const auth=await db.rpc('authorize_driver_job_push',{p_token:token});
 if(auth.error||auth.data!==true) return Response.json({error:'Unauthorized'},{status:401});
 const body=await req.json().catch(()=>({}));
 if(body.health===true) return Response.json({database:true,webConfigured:Boolean(keys.publicKey&&keys.privateKey),androidAuthenticated:await verifyNativePushConfiguration(),relayConfigured:Boolean(Deno.env.get('TURN_SHARED_SECRET')&&(Deno.env.get('TURN_URLS')||'').split(',').some(x=>/^turns?:/.test(x.trim())))});
 const claimed=await db.rpc('claim_app_push_batch');
 if(claimed.error) return Response.json({error:'Queue unavailable'},{status:500});
 let completed=0;
 for(const job of claimed.data||[]) {
  try {
   const {data:n,error}=await db.from('notifications').select('*').eq('id',job.notification_id).single();
   if(error) throw error;
   const expired=['job_ring','in_app_call','admin_group_call'].includes(n.type)&&(n.is_read||Date.now()-Date.parse(n.created_at)>180000);
   if(!expired) {
    const payload=()=>({title:n.title,body:n.message,url:n.link,tag:`movezw-event-${n.id}`});
    const ids=[n.user_id];
    if(!keys.publicKey||!keys.privateKey) {
     const {count,error}=await db.from('push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',n.user_id);
     if(error||count) throw new Error('Web push configuration missing');
    }
    await Promise.all([keys.publicKey&&keys.privateKey?sendPushToUsers(db,ids,(_id,vibration)=>JSON.stringify({...payload(),vibration})):0,sendNativePushToUsers(db,ids,payload)]);
   }
   const result=await db.from('app_push_outbox').update({delivered_at:new Date().toISOString()}).eq('notification_id',job.notification_id).eq('attempts',job.attempts);
   if(result.error) throw result.error;
   completed++;
  } catch(error) { console.error('App alert deferred',job.notification_id,error); }
 }
 return Response.json({completed,retrying:(claimed.data||[]).length-completed});
});
