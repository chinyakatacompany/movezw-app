import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Users, Phone } from 'lucide-react';

export default function AdminGroupCalls() {
  const [users, setUsers] = useState([]);
  const [audience, setAudience] = useState('driver');
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void supabase.rpc('admin_user_directory').then(({ data, error }) => { if (error) toast({ title: 'Could not load users', description: error.message }); else setUsers(data || []); }); }, []);
  const start = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('start_admin_group', { p_users: selected, p_audience: audience });
    setBusy(false);
    if (error) toast({ title: 'Could not start group call', description: error.message });
    else { setSelected([]); window.dispatchEvent(new Event('movezw:group-created')); }
  };
  const candidates = users.filter(u => u.role === audience && !u.is_suspended && !u.deleted_at && (u.full_name || '').toLowerCase().includes(query.toLowerCase()));
  return <main className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
    <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">MoveZW communications</p><h1 className="flex items-center gap-2 text-2xl font-bold"><Users />Group calls</h1><p className="mt-2 text-sm text-muted-foreground">Invite up to five drivers or five customers. Each person chooses whether to join. The call ends for everyone when you leave.</p></div>
    <div className="flex gap-2">{['driver','customer'].map(role => <button key={role} onClick={() => { setAudience(role); setSelected([]); }} className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize ${audience === role ? 'bg-primary text-primary-foreground' : ''}`}>{role}s</button>)}</div>
    <input aria-label="Search participants" className="w-full rounded-xl border bg-background p-3" placeholder="Search by name" value={query} onChange={e => setQuery(e.target.value)} />
    <p className="text-sm font-semibold">{selected.length} of 5 selected</p>
    <div className="max-h-[50dvh] space-y-2 overflow-y-auto">{candidates.map(u => <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4"><input type="checkbox" checked={selected.includes(u.id)} disabled={!selected.includes(u.id) && selected.length >= 5} onChange={() => setSelected(current => current.includes(u.id) ? current.filter(id => id !== u.id) : [...current,u.id])} /><span className="text-sm font-semibold">{u.full_name || 'Unnamed user'}</span></label>)}{!candidates.length && <p className="p-4 text-sm text-muted-foreground">No matching participants.</p>}</div>
    <button onClick={() => void start()} disabled={busy || !selected.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-4 font-bold text-white disabled:opacity-50"><Phone className="h-5 w-5" />{busy ? 'Inviting…' : 'Start group call'}</button>
  </main>;
}
