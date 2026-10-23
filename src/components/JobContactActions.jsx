import { useEffect, useState } from 'react';
import { BellRing, Phone } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { requestJobCall } from '@/lib/jobAudio';
import { useToast } from '@/components/ui/use-toast';

export default function JobContactActions({ request, recipientId }) {
  const [busy, setBusy] = useState(false);
  const [activeRing, setActiveRing] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(0), Math.max(0, cooldown - Date.now())); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => {
    if (!activeRing) return;
    let alive = true;
    const timer = setInterval(async () => { const { data, error } = await supabase.rpc('job_ring_active', { p_ring: activeRing }); if (alive && !error && !data) setActiveRing(null); }, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [activeRing]);
  const stop = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('stop_job_ring', { p_ring: activeRing });
    setBusy(false);
    if (!error) setActiveRing(null);
    else toast({ title: 'Could not stop ring', description: error.message });
  };
  if (!request || !recipientId) return null;
  const accepted = request.accepted_driver_id && ['confirmed', 'en_route_pickup', 'collected', 'in_transit', 'delivered', 'completed'].includes(request.status);
  if (!accepted && request.status !== 'open') return null;
  const ring = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('ring_job_party', { p_request: request.id, p_recipient: recipientId });
    setBusy(false);
    if (!error) { setCooldown(Date.now() + 60000); setActiveRing(data); }
    toast({ title: error ? 'Could not ring' : 'Attention alert sent', description: error?.message || 'Rings until acknowledged or stopped, for up to 3 minutes. Calls and chat remain locked before acceptance.' });
  };
  return <button type="button" disabled={busy || (!accepted && !activeRing && Date.now() < cooldown)} onClick={accepted ? () => requestJobCall(request.id) : activeRing ? stop : ring}
    className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">
    {accepted ? <Phone className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}{accepted ? 'In-app call' : activeRing ? 'Stop ringing' : 'Ring'}
  </button>;
}
