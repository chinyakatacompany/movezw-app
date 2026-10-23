import { useEffect, useState } from 'react';
import { BellRing, Phone } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { requestJobCall } from '@/lib/jobAudio';
import { useToast } from '@/components/ui/use-toast';

export default function JobContactActions({ request, recipientId }) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(0), Math.max(0, cooldown - Date.now())); return () => clearTimeout(timer); }, [cooldown]);
  if (!request || !recipientId) return null;
  const accepted = request.accepted_driver_id && ['confirmed', 'en_route_pickup', 'collected', 'in_transit', 'delivered', 'completed'].includes(request.status);
  if (!accepted && request.status !== 'open') return null;
  const ring = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('ring_job_party', { p_request: request.id, p_recipient: recipientId });
    setBusy(false);
    if (!error) setCooldown(Date.now() + 60000);
    toast({ title: error ? 'Could not ring' : 'Attention alert sent', description: error?.message || 'No call or chat starts before the job is accepted.' });
  };
  return <button type="button" disabled={busy || (!accepted && Date.now() < cooldown)} onClick={accepted ? () => requestJobCall(request.id) : ring}
    className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">
    {accepted ? <Phone className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}{accepted ? 'In-app call' : 'Ring'}
  </button>;
}
