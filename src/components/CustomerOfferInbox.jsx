import DriverBidCard from '@/components/DriverBidCard';
import { acceptOffer as acceptOfferRpc } from '@/lib/payments';
import { toast } from '@/components/ui/use-toast';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { playNotificationChime } from '@/lib/sound';
import { offerRevision, pendingOfferQueue } from '@/lib/offerInbox';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

function readReviewed(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
  catch { return {}; }
}

// Lives above Routes, so changing screens never drops a queued offer.
export default function CustomerOfferInbox() {
  const { user } = useAuth();
  return user?.role === 'customer' ? <OfferInbox key={user.id} userId={user.id} /> : null;
}

function OfferInbox({ userId }) {
  const navigate = useNavigate();
  const storageKey = `movezw-reviewed-offers:${userId}`;
  const [reviewed, setReviewed] = useState(() => readReviewed(storageKey));
  const [snapshot, setSnapshot] = useState({ offers: [], requests: [] });
  const [minimized, setMinimized] = useState(false);
  const [acting, setActing] = useState(null);

  useEffect(() => {
    let active = true;
    let running = false;
    let rerun = false;
    const announced = new Set();
    const refresh = async () => {
      if (running) { rerun = true; return; }
      running = true;
      try {
        // Paginate so a busy customer's older requests cannot hide bids.
        const requests = [];
        for (let offset = 0; active; offset += 500) {
          const { data, error } = await supabase.from('transport_requests')
            .select('id,status,accepted_driver_id,timing,scheduled_date,created_at,cargo_type,pickup_location,destination')
            .eq('customer_id', userId).eq('status', 'open').order('id').range(offset, offset + 499);
          if (error) throw error;
          requests.push(...data);
          if (data.length < 500) break;
        }
        const offers = [];
        for (let start = 0; active && start < requests.length; start += 100) {
          const ids = requests.slice(start, start + 100).map((r) => r.id);
          for (let offset = 0; active; offset += 500) {
            const { data, error } = await supabase.from('offers').select('*')
              .in('request_id', ids).eq('status', 'pending').order('id').range(offset, offset + 499);
            if (error) throw error;
            offers.push(...data);
            if (data.length < 500) break;
          }
        }
        if (!active) return;
        const queue = pendingOfferQueue(offers, requests, readReviewed(storageKey));
        const newOffers = queue.filter((o) => !announced.has(offerRevision(o)));
        queue.forEach((o) => announced.add(offerRevision(o)));
        setSnapshot({ offers, requests });
        if (newOffers.length) { setMinimized(false); playNotificationChime(); }
      } catch (error) {
        // Keep the previous queue on a failed refresh. Retry on the next
        // event/resume/poll instead of silently clearing unseen bids.
        console.error('Could not refresh offer inbox:', error);
      } finally {
        running = false;
        if (active && rerun) { rerun = false; void refresh(); }
      }
    };
    const channel = supabase.channel(`customer-offer-inbox-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `customer_id=eq.${userId}` }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(resume, 15000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
      supabase.removeChannel(channel);
    };
  }, [userId, storageKey]);

  const queue = pendingOfferQueue(snapshot.offers, snapshot.requests, reviewed);
  const offer = queue[0];
  const decide = async (item, accept) => {
    setActing(item.id);
    try {
      if (accept) await acceptOfferRpc({ offerId: item.id });
      else { const { error } = await supabase.rpc('decline_job_bid', { p_offer: item.id }); if (error) throw error; }
      const next = { ...reviewed, [item.id]: offerRevision(item) };
      setReviewed(next);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* session state remains */ }
      setSnapshot(current => ({ ...current, offers: current.offers.filter(o => accept ? o.request_id !== item.request_id : o.id !== item.id) }));
      toast({ title: accept ? 'Driver booked' : 'Offer declined' });
      if (accept) { setMinimized(true); navigate(`/customer/request/${item.request_id}`); }
    } catch (error) { toast({ title: 'Could not update offer', description: error.message, variant: 'destructive' }); }
    finally { setActing(null); }
  };
  if (!offer) return null;
  return <>
    {minimized && <button onClick={() => setMinimized(false)}
      className="fixed right-4 bottom-24 z-50 rounded-full bg-red-600 text-white px-5 py-3 font-semibold shadow-lg">
      {queue.length} unreviewed offer{queue.length === 1 ? '' : 's'}
    </button>}
    <Dialog open={!minimized} onOpenChange={(open) => { if (!open) setMinimized(true); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl p-6" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogTitle>MoveZW · Driver offers</DialogTitle>
        <DialogDescription>{queue.length} offer{queue.length === 1 ? '' : 's'} waiting for your review</DialogDescription>
        <div className="max-h-[65dvh] space-y-3 overflow-y-auto -mx-2 px-1 pb-2">
          {queue.map(item => <DriverBidCard key={item.id} offer={item} request={item.request} busy={Boolean(acting)}
            onView={() => { setMinimized(true); navigate(`/customer/request/${item.request_id}?offer=${item.id}`); }}
            onAccept={() => void decide(item, true)} onDecline={() => void decide(item, false)} />)}
        </div>
        <button className="rounded-xl border py-3 font-medium" onClick={() => setMinimized(true)}>Review later</button>
      </DialogContent>
    </Dialog>
  </>;
}
