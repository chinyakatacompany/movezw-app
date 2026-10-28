import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Gift, Share2, RefreshCw } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { driverReferralLink } from '@/lib/referrals';
import { formatMoney } from '@/lib/movezw';

export default function DriverReferrals() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data, error: failure } = await supabase.rpc('my_driver_referrals');
      if (failure) throw failure;
      setSummary(data); setError('');
    } catch { setError('Could not refresh referrals. Please retry.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); setNotice('Copied.'); }
    catch { setNotice('Copy is unavailable. Select the link or code below and copy it.'); }
  };
  const share = async () => {
    const url = driverReferralLink(summary.code);
    if (navigator.share) {
      try { await navigator.share({ title: 'Join MoveZW as a driver', text: `Download MoveZW and register as a driver. My referral code is ${summary.code}.`, url }); }
      catch (failure) { if (failure.name !== 'AbortError') void copy(url); }
    } else void copy(url);
  };
  return <div className="p-4 pb-8 max-w-2xl mx-auto">
    <Link to="/driver/profile" className="text-sm text-primary">← Driver profile</Link>
    <div className="flex justify-between items-center gap-3 mt-4 mb-5"><h1 className="text-2xl font-bold">Refer drivers, earn credit</h1><button disabled={busy} onClick={load} aria-label="Refresh referrals" className="p-2 rounded-xl border disabled:opacity-50"><RefreshCw className={`w-5 h-5 ${busy ? 'animate-spin' : ''}`} /></button></div>
    <div className="rounded-2xl bg-primary text-primary-foreground p-5 mb-5"><Gift className="h-8 w-8 mb-3" /><p className="text-3xl font-extrabold">{summary ? formatMoney(summary.reward_amount) : 'Wallet credit'} per verified driver</p><p className="text-sm mt-2 opacity-90">Keep referring drivers—there is no limit. Each new driver earns you one reward after full verification and admin approval of the reward.</p></div>
    {error && <p role="alert" className="text-sm text-destructive mb-4">{error}</p>}
    {!summary && !error && <p role="status">Loading your referral link…</p>}
    {summary && <>
      {!summary.enabled && <p role="status" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-4 text-sm mb-4">Referrals are paused by admin. New referrals and rewards are stopped. Pending referrals and credit already earned are kept.</p>}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <label htmlFor="driver-referral-code" className="block text-sm font-semibold">Your referral code</label>
        <div className="flex gap-2"><input id="driver-referral-code" readOnly value={summary.code} className="min-w-0 flex-1 rounded-xl border p-3 bg-background font-bold tracking-wider" /><button onClick={() => copy(summary.code)} className="border rounded-xl p-3" aria-label="Copy referral code"><Copy className="h-5 w-5" /></button></div>
        <label htmlFor="driver-referral-link" className="block text-sm font-semibold">Your download and registration link</label>
        <input id="driver-referral-link" readOnly value={driverReferralLink(summary.code)} className="w-full rounded-xl border p-3 bg-background text-sm" />
        <div className="grid grid-cols-2 gap-3"><button disabled={!summary.enabled || Boolean(error)} onClick={share} className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl p-3 text-sm font-semibold disabled:opacity-50"><Share2 className="h-4 w-4" />Share link</button><button onClick={() => copy(driverReferralLink(summary.code))} className="flex items-center justify-center gap-2 border rounded-xl p-3 text-sm"><Copy className="h-4 w-4" />Copy link</button></div>
        <p className="text-xs text-muted-foreground">Your link opens driver registration and the Android download. After installing, the driver can return to the link or enter your code before registering.</p>
        {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2 my-5">{[['Registered', summary.registered], ['Rewarded', summary.rewarded], ['Credit earned', formatMoney(summary.earned)]].map(([label, value]) => <div key={label} className="bg-card border rounded-xl p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-bold text-xl mt-1">{value}</p></div>)}</div>
      <p className="text-sm text-muted-foreground">{summary.registered-summary.rewarded} referral(s) awaiting full verification or admin reward approval. Referral credit pays MoveZW commissions automatically and cannot be withdrawn. Normal wallet minimum-balance rules still apply.</p>
      <Link to="/wallet" className="inline-block mt-4 text-primary font-semibold">View wallet and reward transactions →</Link>
    </>}
  </div>;
}
