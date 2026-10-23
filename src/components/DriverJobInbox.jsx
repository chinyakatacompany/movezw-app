import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { withTimeout } from '@/lib/withTimeout';
import { playNotificationChime } from '@/lib/sound';
import { DRIVER_ALERT_EVENT, driverJobAlertQueue } from '@/lib/driverJobAlerts';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Keep every unreviewed job above Routes, including after a reconnect/resume.
export default function DriverJobInbox() {
  const { user } = useAuth();
  return user?.role === 'driver' ? <Inbox key={user.id} userId={user.id} /> : null;
}

function Inbox({ userId }) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState({ notifications: [], requests: [] });
  const [minimized, setMinimized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let running = false;
    let rerun = false;
    const announced = new Set();
    const refresh = async () => {
      if (!active) return;
      if (running) { rerun = true; return; }
      running = true;
      try {
        const notifications = [];
        for (let offset = 0; active; offset += 500) {
          const { data, error } = await withTimeout(supabase.from('notifications').select('*')
            .eq('user_id', userId).eq('type', 'job_assigned').eq('is_read', false)
            .order('created_at').order('id').range(offset, offset + 499));
          if (error) throw error;
          notifications.push(...data);
          if (data.length < 500) break;
        }
        const ids = [...new Set(notifications.map((n) => /^\/driver\/job\/([^/?#]+)$/.exec(n.link || '')?.[1]).filter(Boolean))];
        const requests = [];
        for (let start = 0; active && start < ids.length; start += 100) {
          const { data, error } = await withTimeout(supabase.from('transport_requests')
            .select('id,status,accepted_driver_id,timing,scheduled_date,created_at')
            .in('id', ids.slice(start, start + 100)));
          if (error) throw error;
          requests.push(...data);
        }
        if (!active) return;
        const queue = driverJobAlertQueue(notifications, requests);
        const unseen = queue.some((n) => !announced.has(n.id));
        queue.forEach((n) => announced.add(n.id));
        setSnapshot({ notifications, requests });
        if (unseen) { setMinimized(false); void playNotificationChime().catch(console.error); }
      } catch (error) {
        console.error('Could not refresh driver job alerts:', error);
      } finally {
        running = false;
        if (active && rerun) { rerun = false; void refresh(); }
      }
    };
    const channel = supabase.channel(`driver-job-inbox-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transport_requests' }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = setInterval(resume, 15000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener(DRIVER_ALERT_EVENT, resume);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener(DRIVER_ALERT_EVENT, resume);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const queue = driverJobAlertQueue(snapshot.notifications, snapshot.requests);
  const alert = queue[0];
  const acknowledge = async (view) => {
    if (!alert || saving) return;
    setSaving(true);
    setError('');
    try {
      // Also acknowledge any legacy duplicates for this exact job.
      const { error } = await withTimeout(supabase.from('notifications').update({ is_read: true })
        .eq('user_id', userId).eq('type', 'job_assigned').eq('link', alert.link));
      if (error) throw error;
      setSnapshot((s) => ({ ...s, notifications: s.notifications.filter((n) => n.link !== alert.link) }));
      if (view) { setMinimized(true); navigate(alert.link); }
    } catch {
      setError('Could not dismiss this alert. Check your connection and try again.');
    } finally { setSaving(false); }
  };
  if (!alert) return null;
  return <>
    {minimized && <button onClick={() => setMinimized(false)} className="fixed right-4 bottom-24 z-50 rounded-full bg-primary text-primary-foreground px-5 py-3 shadow-lg">{queue.length} new job{queue.length === 1 ? '' : 's'}</button>}
    <Dialog open={!minimized} onOpenChange={(open) => { if (!open) setMinimized(true); }}>
      <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto rounded-2xl p-6" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogTitle>New transport job</DialogTitle>
        <DialogDescription>{queue.length} job{queue.length === 1 ? '' : 's'} waiting for your review</DialogDescription>
        <p className="font-medium break-words">{alert.message}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={saving} onClick={() => { void acknowledge(true); }} className="rounded-xl bg-primary text-primary-foreground py-3 font-semibold">View job</button>
        <button disabled={saving} onClick={() => { void acknowledge(false); }} className="rounded-xl border py-3">Dismiss notification</button>
      </DialogContent>
    </Dialog>
  </>;
}
