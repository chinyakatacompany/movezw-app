import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { createJobAudio } from '@/lib/jobAudio';
import { playNotificationChime } from '@/lib/sound';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function JobCallPanel() {
  const { user } = useAuth();
  return user?.id ? <CallPanel key={user.id} userId={user.id} /> : null;
}
function CallPanel({ userId }) {
  const [call, setCall] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const audio = useRef(null);
  const media = useRef(null);
  const current = useRef(null);
  current.current = call;
  useEffect(() => {
    let alive = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const { data, error } = await supabase.from('job_calls').select('*').in('status', ['ringing', 'connecting']).gt('expires_at', new Date().toISOString()).or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order('created_at', { ascending: false }).limit(1);
        if (!error && alive) setCall(data?.[0] || null);
      } finally { refreshing = false; }
    };
    const start = async (event) => {
      if (document.documentElement.dataset.movezwGroupAudio === 'joined') { setMessage('Leave the group call first.'); return; }
      if (current.current) { setMessage('Finish the current call first.'); return; }
      setMessage('');
      setBusy(true);
      try {
        const { data, error } = await supabase.rpc('start_job_call', { p_request: event.detail.requestId });
        if (error) throw error;
        if (alive) setCall(data);
      } catch (error) { if (alive) setMessage(error.message || 'Could not start call.'); }
      finally { if (alive) setBusy(false); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    const channel = supabase.channel(`calls-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'job_calls' }, refresh).subscribe();
    window.addEventListener('movezw:start-call', start);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('movezw:start-call', start); supabase.removeChannel(channel); };
  }, [userId]);
  useEffect(() => {
    if (!call?.expires_at) return;
    const timer = setTimeout(() => setCall(null), Math.max(0, Date.parse(call.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [call?.id, call?.expires_at]);
  const incoming = call?.callee_id === userId;
  const ready = call && (!incoming || call.status === 'connecting');
  useEffect(() => {
    if (!ready || !call) return;
    let cancelled = false;
    setMuted(false);
    setMessage(incoming ? 'Connecting…' : 'Calling…');
    void createJobAudio(call, userId, value => { if (!cancelled) setMessage(value); }, audio.current).then(controller => {
      if (cancelled) controller.close(); else media.current = controller;
    }).catch(async error => {
      if (!cancelled) {
        setMessage(error.message || 'Microphone unavailable. Check device permissions.');
        await supabase.rpc('respond_job_call', { p_call: call.id, p_action: 'end' });
      }
    });
    return () => { cancelled = true; media.current?.close(); media.current = null; };
    // The same connection survives the ringing → connecting transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id, Boolean(ready), userId]);
  useEffect(() => {
    if (!incoming || call?.status !== 'ringing') return;
    playNotificationChime();
    const timer = setInterval(() => { playNotificationChime(); navigator.vibrate?.([250, 100, 250]); }, 2500);
    return () => { clearInterval(timer); navigator.vibrate?.(0); };
  }, [incoming, call?.status]);
  const respond = async action => {
    setBusy(true);
    const { error } = await supabase.rpc('respond_job_call', { p_call: call.id, p_action: action });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    if (action === 'accept') setCall(value => ({ ...value, status: 'connecting' }));
    else { media.current?.close(); media.current = null; setCall(null); setMessage(''); }
  };
  return <>
    <audio ref={audio} autoPlay />
    {!call && message && <div role="alert" className="fixed bottom-24 inset-x-4 z-[80] rounded-xl bg-background border p-4 shadow-lg">{message}<button className="ml-3 underline" onClick={() => setMessage('')}>Dismiss</button></div>}
    <Dialog open={Boolean(call)} onOpenChange={() => { /* Use explicit answer/end buttons. */ }}>
      <DialogContent className="max-w-sm rounded-2xl" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogTitle>{incoming && call?.status === 'ringing' ? 'Incoming MoveZW call' : 'MoveZW audio call'}</DialogTitle>
        <DialogDescription>Private audio for your accepted job. Your telephone number is not shared by this call.</DialogDescription>
        <p role="status">{message || (incoming ? 'Answer to connect your microphone.' : 'Calling…')}</p>
        {incoming && call?.status === 'ringing' ? <button disabled={busy} className="rounded-xl bg-green-600 text-white p-3" onClick={() => void respond('accept')}>Answer</button> : <>
          <button className="rounded-xl border p-3" onClick={() => { const next = !muted; media.current?.mute(next); setMuted(next); }}>{muted ? 'Unmute' : 'Mute'}</button>
          <button className="rounded-xl border p-3" onClick={() => void audio.current?.play().catch(() => setMessage('Audio playback is blocked on this device.'))}>Play audio</button>
        </>}
        <button disabled={busy} className="rounded-xl bg-red-600 text-white p-3" onClick={() => void respond(incoming && call?.status === 'ringing' ? 'decline' : 'end')}>{incoming && call?.status === 'ringing' ? 'Decline' : 'End call'}</button>
      </DialogContent>
    </Dialog>
  </>;
}
