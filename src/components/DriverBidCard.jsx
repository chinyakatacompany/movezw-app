import { useEffect, useState } from 'react';
import { BadgeCheck, ChevronDown, Clock, Truck, Star, Weight } from 'lucide-react';
import { formatMoney } from '@/lib/movezw';
import { bidTonnage } from '@/lib/bidPresentation';
import JobContactActions from '@/components/JobContactActions';

export default function DriverBidCard({ offer, request, onView = null, onAccept, onDecline, initialExpanded = false, busy = false }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  useEffect(() => { if (initialExpanded) setExpanded(true); }, [initialExpanded]);
  return <article className="overflow-hidden rounded-[24px] border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-white text-slate-900 shadow-[0_5px_20px_rgba(15,23,42,0.08)]">
    <div className="flex items-center justify-between border-b border-emerald-100/70 px-4 py-2">
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide"><Truck className="h-3.5 w-3.5 text-red-600" /><span>Move<span className="text-red-600">ZW</span></span><span className="ml-1 font-medium text-slate-500">DRIVER OFFER</span></span>
      {offer.verified && <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Verified</span>}
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-bold">{offer.driver_photo_url ? <img src={offer.driver_photo_url} alt="" className="h-full w-full object-cover" /> : (offer.driver_name || 'D').slice(0,1)}</div>
        <div className="min-w-0"><p className="truncate text-sm font-bold">{offer.driver_name || 'Driver'}</p><p className="flex items-center gap-1 text-[11px] text-slate-500"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(offer.driver_rating || 0).toFixed(1)} · {offer.completed_jobs || 0} trips</p></div>
      </div>
      <div className="min-w-0 text-right"><p className="text-xs font-bold">{offer.vehicle_name || offer.vehicle_type || 'Vehicle'}</p><p className="text-[11px] text-slate-500">{offer.vehicle_type || 'Type not provided'}</p>{offer.license_plate && <p className="text-[10px] font-semibold text-slate-500">{offer.license_plate}</p>}</div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <p className="text-3xl font-extrabold tracking-tight">{formatMoney(offer.price)}</p>
      <div className="flex flex-col items-end gap-1 text-xs"><span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-900"><Weight className="h-3 w-3" />{bidTonnage(offer)}</span><span className="flex items-center gap-1 text-slate-500"><Clock className="h-3 w-3" />{offer.eta_minutes ? `${offer.eta_minutes} min to pickup` : 'Arrival time not provided'}</span></div>
    </div>
    <div className="grid grid-cols-3 gap-2 px-4 pb-4">
      <button disabled={busy} onClick={() => { if (onView) onView(); else setExpanded(v => !v); }} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-bold disabled:opacity-50">View offer<ChevronDown className="h-3 w-3" /></button>
      <button disabled={busy} onClick={onAccept} className="min-h-11 rounded-xl bg-lime-400 text-xs font-bold text-slate-950 shadow-sm hover:bg-lime-300 disabled:opacity-50">{busy ? 'Please wait…' : 'Accept'}</button>
      <button disabled={busy} onClick={onDecline} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">Decline</button>
    </div>
    {expanded && <div className="space-y-3 border-t border-emerald-100 bg-white/70 px-4 py-3"><p className="text-xs text-slate-600">{request?.pickup_location} → {request?.destination}</p>{offer.note && <p className="break-words text-sm">{offer.note}</p>}<JobContactActions request={request} recipientId={offer.driver_id} /></div>}
  </article>;
}
