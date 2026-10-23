import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { createGroupAudio } from '@/lib/groupAudio';
import { playNotificationChime } from '@/lib/sound';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AdminGroupCallPanel() {
  const { user } = useAuth();
  return user?.id ? <GroupPanel key={user.id} userId={user.id} /> : null;
}
function GroupPanel({ userId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const media = useRef(null);
  const room = snapshot?.room;
  const me = snapshot?.members.find(m => m.user_id === userId);
  const joined = me?.state === 'joined';
  useEffect(() => {
    let alive = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const membership = await supabase.from('admin_call_members').select('room_id,state').eq('user_id', userId).in('state', ['invited', 'joined']);
        if (membership.error) return;
        const ids = (membership.data || []).map(m => m.room_id);
        if (!ids.length) { if (alive) setSnapshot(null); return; }
        const rooms = await supabase.from('admin_call_rooms').select('*').in('id', ids).is('ended_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
        if (rooms.error) return;
        const selected = (rooms.data || []).find(r => membership.data.some(m => m.room_id === r.id && m.state === 'joined')) || rooms.data?.[0];
        if (!selected) { if (alive) setSnapshot(null); return; }
        const members = await supabase.from('admin_call_members').select('*').eq('room_id', selected.id);
        if (alive && !members.error) setSnapshot({ room: selected, members: members.data || [] });
      } finally { running = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    const channel = supabase.channel(`admin-group-inbox-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'admin_call_members' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'admin_call_rooms' }, refresh).subscribe();
    window.addEventListener('movezw:group-created', refresh);
    return () => { alive = false; clearInterval(timer); supabase.removeChannel(channel); window.removeEventListener('movezw:group-created', refresh); };
  }, [userId]);
  useEffect(() => {
    if (!room?.id || !joined) return;
    let cancelled = false;
    document.documentElement.dataset.movezwGroupAudio = 'joined';
    setMessage('Connecting group audio…'); setMuted(false);
    void createGroupAudio(room, userId, value => { if (!cancelled) setMessage(value); }).then(controller => {
      if (cancelled) controller.close(); else { media.current = controller; setMessage('Microphone connected. Waiting for participants to join.'); }
    }).catch(async error => {
      if (!cancelled) { setMessage(error.message || 'Could not access microphone.'); await supabase.rpc('respond_admin_group', { p_room: room.id, p_action: 'leave' }); }
    });
    return () => { cancelled = true; delete document.documentElement.dataset.movezwGroupAudio; media.current?.close(); media.current = null; };
    // Keep one microphone/peer set for the duration of the joined room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, joined, userId]);
  useEffect(() => {
    if (!room || room.host_id !== userId || !joined) return;
    const heartbeat = () => void supabase.rpc('respond_admin_group', { p_room: room.id, p_action: 'heartbeat' });
    heartbeat(); const timer = setInterval(heartbeat, 12000);
    return () => clearInterval(timer);
  }, [room?.id, room?.host_id, joined, userId]);
  useEffect(() => {
    if (!room || joined || room.host_id === userId) return;
    playNotificationChime();
    const timer = setInterval(() => { playNotificationChime(); navigator.vibrate?.([200, 100, 200]); }, 2500);
    return () => { clearInterval(timer); navigator.vibrate?.(0); };
  }, [room?.id, room?.host_id, joined, userId]);
  const hostJoined = snapshot?.members.some(m => m.user_id === room?.host_id && m.state === 'joined');
  useEffect(() => {
    if (!room) return;
    const deadline = Math.min(Date.parse(room.expires_at), !joined || !hostJoined ? Date.parse(room.invite_until) : Date.parse(room.last_seen_at) + 45000);
    const timer = setTimeout(() => { setSnapshot(null); setMessage('Group call ended or invitation expired.'); }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [room?.id, room?.expires_at, room?.invite_until, room?.last_seen_at, joined, hostJoined]);
  const respond = async action => {
    setBusy(true);
    const result = await supabase.rpc('respond_admin_group', { p_room: room.id, p_action: action });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (action === 'join') setSnapshot(value => ({ ...value, room: value.room.host_id === userId ? { ...value.room, last_seen_at: new Date().toISOString() } : value.room, members: value.members.map(m => m.user_id === userId ? { ...m, state: 'joined' } : m) }));
    else { media.current?.close(); media.current = null; setSnapshot(null); setMessage(''); }
  };
  return <>
    {!room && message && <div role="alert" className="fixed inset-x-4 bottom-24 z-[90] rounded-xl border bg-background p-4">{message}<button className="ml-3 underline" onClick={() => setMessage('')}>Dismiss</button></div>}
    <Dialog open={Boolean(room)} onOpenChange={() => { /* Explicit consent/leave controls. */ }}><DialogContent className="max-w-sm rounded-2xl" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
      <DialogTitle>MoveZW · Admin group call</DialogTitle>
      <DialogDescription>{room?.audience === 'driver' ? 'Driver group' : 'Customer group'} · Audio only. Join to enable your microphone. Numbers are not shared.</DialogDescription>
      <ul className="max-h-48 space-y-2 overflow-y-auto">{snapshot?.members.map(m => <li key={m.user_id} className="flex justify-between gap-3 rounded-xl bg-muted p-3 text-sm"><span>{m.display_name}{m.user_id === room?.host_id ? ' · Admin' : ''}</span><span className="text-xs capitalize text-muted-foreground">{m.state}</span></li>)}</ul>
      <p role="status" className="text-sm">{message}</p>
      {!joined ? <button disabled={busy} className="rounded-xl bg-emerald-600 p-3 font-semibold text-white" onClick={() => void respond('join')}>Join group call</button> : <div className="grid grid-cols-2 gap-2"><button className="rounded-xl border p-3" onClick={() => { media.current?.mute(!muted); setMuted(v => !v); }}>{muted ? 'Unmute' : 'Mute'}</button><button className="rounded-xl border p-3" onClick={() => media.current?.play()}>Play audio</button></div>}
      <button disabled={busy} className="rounded-xl bg-red-600 p-3 font-semibold text-white" onClick={() => void respond(joined ? 'leave' : 'decline')}>{room?.host_id === userId ? 'End group call for everyone' : joined ? 'Leave call' : 'Decline'}</button>
    </DialogContent></Dialog>
  </>;
}
