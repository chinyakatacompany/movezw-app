import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { formatMoney, formatDate } from '@/lib/movezw';
import ConfirmDialog from '@/components/shared/ConfirmDialog';

export default function AdminReferrals() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const savingRef = useRef(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (savingRef.current) return;
    const ticket = ++sequence.current;
    const { data, error: failure } = await supabase.rpc('admin_driver_referrals');
    if (ticket !== sequence.current) return;
    if (failure) { setError('Could not refresh referral settings. Retry before making changes.'); return; }
    setSummary(data); setError('');
  }, []);
  useEffect(() => { void load(); const timer=setInterval(load,15000); return () => clearInterval(timer); }, [load]);
  const toggle = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    ++sequence.current;
    setSaving(true);
    try {
      const { data, error: failure } = await supabase.rpc('admin_driver_referrals', { p_enabled: !summary.enabled });
      if (failure) throw failure;
      setSummary(data); setError('');
    } catch { setError('Could not change referral settings. Refresh and try again.'); }
    finally { savingRef.current = false; setSaving(false); setConfirm(false); }
  };
  return <div className="p-4 sm:p-6 max-w-5xl mx-auto">
    <div className="flex items-center justify-between mb-5"><h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-6 w-6 text-primary" />Driver referrals</h1><button disabled={saving} onClick={load} aria-label="Refresh referrals" className="p-2 border rounded-xl"><RefreshCw className="h-5 w-5" /></button></div>
    {error && <p role="alert" className="text-destructive text-sm mb-4">{error}</p>}
    {!summary && !error && <p role="status">Loading referral settings…</p>}
    {summary && <>
      <section className="bg-card border rounded-2xl p-5 mb-5"><div className="flex flex-wrap justify-between gap-4 items-center"><div><h2 className="font-bold text-lg">Referrals are {summary.enabled ? 'enabled' : 'paused'}</h2><p className="text-sm text-muted-foreground mt-1">One app-wide switch controls all drivers and referral links.</p></div><button disabled={saving || Boolean(error)} onClick={() => setConfirm(true)} className={`rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${summary.enabled ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>{saving ? 'Saving…' : summary.enabled ? 'Pause all referrals' : 'Enable referrals'}</button></div><p className="text-sm text-muted-foreground mt-4">Each fully verified new driver rewards their referrer with $0.50 commission credit. Referrers can earn repeatedly for different drivers, without a referral limit. Pausing stops new referrals and rewards; existing credit and pending referrals are kept. Enabling referrals releases eligible pending rewards.</p></section>
      <div className="grid grid-cols-3 gap-3 mb-5">{[['Registered',summary.registered],['Rewarded',summary.rewarded],['Credit issued',formatMoney(summary.earned)]].map(([label,value]) => <div key={label} className="bg-card border rounded-xl p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold mt-1">{value}</p></div>)}</div>
      <h2 className="font-semibold mb-3">Latest referrals (up to 200)</h2>
      <div className="space-y-3">{summary.recent.length === 0 ? <p className="text-sm text-muted-foreground">No drivers have registered with a referral code yet.</p> : summary.recent.map((row) => <article key={row.id} className="bg-card border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{row.driver}</p><p className="text-sm text-muted-foreground">Referred by {row.referrer} · {formatDate(row.created_at)}</p></div><span className={`text-sm font-semibold ${row.rewarded_at ? 'text-emerald-600' : 'text-amber-600'}`}>{row.rewarded_at ? `${formatMoney(row.amount)} credited` : 'Awaiting verification / eligibility'}</span></article>)}</div>
      <ConfirmDialog open={confirm} onClose={() => { if (!saving) setConfirm(false); }} onConfirm={toggle} title={summary.enabled ? 'Pause referrals for the whole app?' : 'Enable referrals for the whole app?'} description={summary.enabled ? 'Stops new referrals and reward credits immediately. Pending referrals and previously earned credit are preserved.' : 'New referrals can register and eligible pending referrals will receive their $0.50 credit.'} confirmText={summary.enabled ? 'Pause all referrals' : 'Enable referrals'} destructive={summary.enabled} />
    </>}
  </div>;
}
