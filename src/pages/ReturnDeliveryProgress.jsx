import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { STATUS_FLOW, STATUS_LABELS } from '@/lib/movezw';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function ReturnDeliveryProgress() {
  const { id } = useParams();
  return <Progress key={id} id={id} />;
}

function Progress({ id }) {
  const { user } = useAuth();
  const [delivery, setDelivery] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const ticket = ++sequence;
      const { data, error: err } = await supabase.from('return_load_deliveries').select('*').eq('id', id).maybeSingle();
      if (!active || ticket !== sequence) return;
      if (err || !data) { setError('Could not load this delivery. Check your connection and access.'); return; }
      setDelivery(data);
      setError('');
    };
    const channel = supabase.channel(`return-delivery-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'return_load_deliveries', filter: `id=eq.${id}` }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(resume, 10000);
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', resume); supabase.removeChannel(channel); };
  }, [id]);
  const advance = async (expected) => {
    if (busy) return;
    setBusy(true);
    setConfirm(null);
    try {
      const { error: err } = await supabase.rpc('advance_return_load_delivery', { p_delivery_id: id, p_expected_status: expected });
      if (err) throw err;
      const { data, error: readError } = await supabase.from('return_load_deliveries').select('*').eq('id', id).single();
      if (readError) throw readError;
      setDelivery(data);
      setError('');
    } catch (err) { setError(err.message || 'Could not update progress. Please try again.'); }
    finally { setBusy(false); }
  };
  const current = STATUS_FLOW.indexOf(delivery?.status);
  const next = STATUS_FLOW[current + 1];
  return <main className="p-4 space-y-5">
    <Link to={user.role === 'driver' ? '/driver' : '/customer'} className="text-sm text-primary">Back to home</Link>
    <h1 className="text-2xl font-bold">Return delivery progress</h1>
    {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
    {!delivery && !error && <p role="status">Loading delivery…</p>}
    {delivery && <>
      <div className="rounded-2xl border p-4 space-y-2">
        <p className="font-semibold break-words">{delivery.pickup_location} → {delivery.destination}</p>
        <p className="text-sm text-muted-foreground">{delivery.cargo_type}</p>
      </div>
      <ol className="grid grid-cols-2 gap-3" aria-label="Delivery progress" aria-live="polite">
        {STATUS_FLOW.map((step, index) => <li key={step} aria-current={index === current ? 'step' : undefined}
          className={`rounded-xl border p-4 ${index <= current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          <p className="text-sm font-semibold">{index < current ? '✓' : index + 1}. {STATUS_LABELS[step]}</p>
        </li>)}
      </ol>
      {delivery.status === 'completed' ? <p className="font-semibold">Delivery completed</p>
        : delivery.driver_id === user.id ? <button disabled={busy} onClick={() => {
          if (next === 'collected' || next === 'completed') setConfirm(delivery.status);
          else void advance(delivery.status);
        }} className="w-full rounded-xl bg-primary text-primary-foreground p-4 font-semibold disabled:opacity-50">
          {busy ? 'Updating…' : `Mark as ${STATUS_LABELS[next]}`}
        </button> : <p className="text-sm text-muted-foreground">Your driver's progress updates appear here automatically.</p>}
    </>}
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
      <DialogContent>
        <DialogTitle>{confirm === 'en_route_pickup' ? 'Confirm cargo collected?' : 'Complete this delivery?'}</DialogTitle>
        <DialogDescription>Confirm only when this step has been finished. The customer will see the updated progress.</DialogDescription>
        <button disabled={busy} onClick={() => void advance(confirm)} className="rounded-xl bg-primary text-primary-foreground p-3">Confirm</button>
        <button onClick={() => setConfirm(null)} className="rounded-xl border p-3">Go back</button>
      </DialogContent>
    </Dialog>
  </main>;
}
