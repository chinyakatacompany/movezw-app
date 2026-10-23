import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { playNotificationChime } from '@/lib/sound';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AttentionInbox() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    setItems([]);
    if (!user?.id) return;
    let active = true;
    const announced = new Set();
    const refresh = async () => {
      const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id).eq('is_read', false).in('type', ['driver_registered', 'job_ring']).order('created_at', { ascending: false }).limit(50);
      if (!active || error) return;
      const pending = (data || []).filter(n => n.type !== 'job_ring' || Date.now() - Date.parse(n.created_at) < 60000);
      if (pending.some(n => !announced.has(n.id))) playNotificationChime();
      pending.forEach(n => announced.add(n.id));
      setItems(pending);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const channel = supabase.channel(`attention-${user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh).subscribe();
    return () => { active = false; clearInterval(timer); supabase.removeChannel(channel); };
  }, [user?.id]);
  const first = items[0];
  useEffect(() => {
    if (first?.type !== 'job_ring') return;
    const timer = setInterval(() => { playNotificationChime(); navigator.vibrate?.([200, 100, 200]); }, 2500);
    return () => { clearInterval(timer); navigator.vibrate?.(0); };
  }, [first?.id, first?.type]);
  const dismiss = async (view) => {
    const result = await supabase.from('notifications').update({ is_read: true }).eq('id', first.id).eq('user_id', user.id);
    if (!result.error) setItems(current => current.filter(n => n.id !== first.id));
    if (view) navigate(first.link);
  };
  return first ? <Dialog open onOpenChange={open => { if (!open) void dismiss(false); }}><DialogContent className="max-w-sm rounded-2xl">
    <DialogTitle>{first.title}</DialogTitle><DialogDescription>{first.message}</DialogDescription>
    <button className="rounded-xl bg-primary p-3 text-primary-foreground" onClick={() => void dismiss(true)}>View</button>
    <button className="rounded-xl border p-3" onClick={() => void dismiss(false)}>Dismiss</button>
  </DialogContent></Dialog> : null;
}
