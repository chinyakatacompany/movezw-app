import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { corsHeaders,getServiceRoleKey } from '../_shared/push.ts';
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 const db=createClient(Deno.env.get('SUPABASE_URL')!,getServiceRoleKey());
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return respond({error:'Not authenticated'},401);
 const {requestId,roomId}=await req.json().catch(()=>({}));
 if(typeof (roomId||requestId)!=='string'||!/^[0-9a-f-]{36}$/i.test(roomId||requestId))return respond({error:'Invalid job'},400);
 const active=await db.from('profiles').select('is_suspended,deleted_at').eq('id',user.id).single();
 if(active.error||!active.data||active.data.is_suspended||active.data.deleted_at)return respond({error:'Account unavailable'},403);
 if(roomId) {
  const room=await db.from('admin_call_members').select('room_id,state').eq('room_id',roomId).eq('user_id',user.id).eq('state','joined').single();
  // Use the caller JWT so the room's active-admin/membership RLS is enforced.
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,getServiceRoleKey(),{global:{headers:{Authorization:`Bearer ${token}`}}});
  const allowed=await caller.rpc('admin_group_access',{p_room:roomId});
  if(room.error||allowed.error||allowed.data!==true)return respond({error:'Joined group required'},403);
 } else {
 const result=await db.from('transport_requests').select('customer_id,accepted_driver_id,status').eq('id',requestId).single();
 const job=result.data;
 if(result.error||!job||![job.customer_id,job.accepted_driver_id].includes(user.id)||!job.accepted_driver_id||!['confirmed','en_route_pickup','collected','in_transit','delivered','completed'].includes(job.status))return respond({error:'Accepted job required'},403);
 }
 const servers:unknown[]=[{urls:'stun:stun.l.google.com:19302'}];
 const secret=Deno.env.get('TURN_SHARED_SECRET');
 const urls=(Deno.env.get('TURN_URLS')||'').split(',').map(x=>x.trim()).filter(x=>/^turns?:/.test(x));
 if(secret&&urls.length){
  const username=`${Math.floor(Date.now()/1000)+3900}:${user.id}`;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(username)));
  servers.push({urls,username,credential:btoa(String.fromCharCode(...signature))});
 }
 return respond({iceServers:servers,relayConfigured:Boolean(secret&&urls.length)});
});
