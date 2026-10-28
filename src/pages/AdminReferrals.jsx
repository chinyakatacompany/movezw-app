import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { formatMoney, formatDate } from '@/lib/movezw';
import ConfirmDialog from '@/components/shared/ConfirmDialog';

export default function AdminReferrals() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(null);
  const [amountDraft, setAmountDraft] = useState(null);
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
  const approve = async (row) => {
    if (savingRef.current) return;
    savingRef.current = true;
    ++sequence.current;
    setApproving(row.id);
    try {
      const { data, error: failure } = await supabase.rpc('admin_driver_referrals', { p_referral_id: row.id, p_amount: summary.reward_amount });
      if (failure) throw failure;
      setSummary(data); setError('');
    } catch (failure) { setError(failure.message || 'Could not approve this reward. Refresh and retry.'); }
    finally { savingRef.current = false; setApproving(null); }
  };
  const saveAmount = async (event) => {
    event.preventDefault();
    const amount = Number(amountDraft ?? summary.reward_amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99 || Number(amount.toFixed(2)) !== amount) { setError('Enter a positive amount with at most two decimal places.'); return; }
    if (savingRef.current) return;
    savingRef.current = true; ++sequence.current; setSaving(true);
    try {
      const { data, error: failure } = await supabase.rpc('admin_driver_referrals', { p_amount: amount });
      if (failure) throw failure;
      setSummary(data); setAmountDraft(null); setError('');
    } catch (failure) { setError(failure.message || 'Could not update the referral amount.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="p-4 sm:p-6 max-w-5xl mx-auto">
    <div className="flex items-center justify-between mb-5"><h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-6 w-6 text-primary" />Driver referrals</h1><button disabled={saving || Boolean(approving)} onClick={load} aria-label="Refresh referrals" className="p-2 border rounded-xl"><RefreshCw className="h-5 w-5" /></button></div>
    {error && <p role="alert" className="text-destructive text-sm mb-4">{error}</p>}
    {!summary && !error && <p role="status">Loading referral settings…</p>}
    {summary && <>
      <section className="bg-card border rounded-2xl p-5 mb-5"><div className="flex flex-wrap justify-between gap-4 items-center"><div><h2 className="font-bold text-lg">Referrals are {summary.enabled ? 'enabled' : 'paused'}</h2><p className="text-sm text-muted-foreground mt-1">One app-wide switch controls all drivers and referral links.</p></div><button disabled={saving || Boolean(approving) || Boolean(error)} onClick={() => setConfirm(true)} className={`rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${summary.enabled ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>{saving ? 'Saving…' : summary.enabled ? 'Pause all referrals' : 'Enable referrals'}</button></div><p className="text-sm text-muted-foreground mt-4">Admin can approve {formatMoney(summary.reward_amount)} commission credit for each fully verified referred driver. Referrers can earn repeatedly for different drivers, without a referral limit. Pausing stops new referrals and rewards; existing credit and pending referrals are kept. Enabling referrals allows pending rewards to be reviewed and approved.</p></section>
      <form onSubmit={saveAmount} className="bg-card border rounded-2xl p-5 mb-5"><label htmlFor="referral-reward-amount" className="block font-semibold mb-2">Reward per verified driver (USD)</label><div className="flex flex-wrap gap-3"><input id="referral-reward-amount" type="number" min="0.01" max="99999999.99" step="0.01" required value={amountDraft ?? summary.reward_amount} onChange={(event) => setAmountDraft(event.target.value)} className="border rounded-xl bg-background px-3 h-11 w-40" /><button disabled={saving || Boolean(approving)} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">Save reward amount</button></div><p className="text-xs text-muted-foreground mt-3">Applies to rewards approved afterward, including pending referrals. Previously credited rewards stay unchanged.</p></form>
      <div className="grid grid-cols-3 gap-3 mb-5">{[['Registered',summary.registered],['Rewarded',summary.rewarded],['Credit issued',formatMoney(summary.earned)]].map(([label,value]) => <div key={label} className="bg-card border rounded-xl p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold mt-1">{value}</p></div>)}</div>
      <h2 className="font-semibold mb-3">Ready rewards first (up to 200)</h2>
      <div className="space-y-3">{summary.recent.length === 0 ? <p className="text-sm text-muted-foreground">No drivers have registered with a referral code yet.</p> : summary.recent.map((row) => <article key={row.id} className="bg-card border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{row.driver}</p><p className="text-sm text-muted-foreground">Referred by {row.referrer} · {formatDate(row.created_at)}</p></div><div className="flex flex-wrap items-center gap-3"><span className={`text-sm font-semibold ${row.rewarded_at ? 'text-emerald-600' : 'text-amber-600'}`}>{row.rewarded_at ? `${formatMoney(row.amount)} credited` : row.eligible ? 'Ready for admin approval' : 'Awaiting verification / eligibility'}</span>{!row.rewarded_at && <button disabled={!summary.enabled || !row.eligible || saving || Boolean(approving) || Boolean(error)} onClick={() => approve(row)} className="rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold disabled:opacity-50">{approving === row.id ? 'Approving…' : `Approve ${formatMoney(row.amount)} reward`}</button>}</div></article>)}</div>
      <ConfirmDialog open={confirm} onClose={() => { if (!saving) setConfirm(false); }} onConfirm={toggle} title={summary.enabled ? 'Pause referrals for the whole app?' : 'Enable referrals for the whole app?'} description={summary.enabled ? 'Stops new referrals and reward credits immediately. Pending referrals and previously earned credit are preserved.' : 'New referrals can register and eligible pending rewards can be approved by admin.'} confirmText={summary.enabled ? 'Pause all referrals' : 'Enable referrals'} destructive={summary.enabled} />
    </>}
  </div>;
}
