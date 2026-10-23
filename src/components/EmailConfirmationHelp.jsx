import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { DRIVER_CONFIRMATION_REDIRECT_URL } from '@/lib/authRedirects';

export default function EmailConfirmationHelp({ email = '' }) {
 const [address,setAddress]=useState(email);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [until,setUntil]=useState(0);
 useEffect(()=>setAddress(email),[email]);
 const resend=async()=>{
  if(busy||Date.now()<until)return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.auth.resend({type:'signup',email:address.trim(),options:{emailRedirectTo:DRIVER_CONFIRMATION_REDIRECT_URL}});
   if(error)throw error;
   setUntil(Date.now()+60000);
   setMessage('If this address has a pending signup, a confirmation link has been sent. Open it to confirm your email. An admin can also confirm your driver email.');
  }catch(error){setMessage(error.message);}finally{setBusy(false);}
 };
 return <section className="rounded-xl border p-3 space-y-2">
  <p className="text-sm font-semibold">Confirm your driver email</p>
  <input aria-label="Email for confirmation" type="email" value={address} onChange={(e)=>setAddress(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Your driver email" />
  <button type="button" onClick={()=>void resend()} disabled={busy||!address.trim()} className="text-sm font-semibold text-primary disabled:opacity-50">{busy?'Sending…':'Resend confirmation email'}</button>
  {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
 </section>;
}
