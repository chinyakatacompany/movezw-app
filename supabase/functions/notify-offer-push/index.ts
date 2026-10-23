import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { corsHeaders, getServiceRoleKey } from '../_shared/push.ts';
// Compatibility endpoint for older installed apps. The transactional offer
// trigger queues the alert; client retries must never fan out duplicates.
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 const respond=(body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,getServiceRoleKey());
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return respond({error:'Not authenticated'},401);
 const body=await req.json().catch(()=>({}));
 const offer=await db.from('offers').select('driver_id').eq('id',body.offerId).single();
 if(offer.error||offer.data?.driver_id!==user.id)return respond({error:'Offer unavailable'},403);
 return respond({queued:true,sent:0});
});
