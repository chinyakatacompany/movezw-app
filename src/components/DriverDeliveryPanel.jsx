import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_FLOW, STATUS_LABELS } from '@/lib/movezw';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function DriverDeliveryPanel({ jobs }) {
  const [dismissed, setDismissed] = useState([]);
  const unseen = jobs.filter((job) => !dismissed.includes(job.id));
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        setDismissed([]);
      }
    };
    document.addEventListener('visibilitychange', onResume);
    return () => document.removeEventListener('visibilitychange', onResume);
  }, []);
  const close = () => setDismissed(jobs.map((job) => job.id));
  if (!jobs.length) return null;
  return <section aria-label="Current deliveries" className="space-y-3">
    <h2 className="text-lg font-bold">Current deliver{jobs.length === 1 ? 'y' : 'ies'}</h2>
    {jobs.map((job) => {
      const current = STATUS_FLOW.indexOf(job.status);
      const next = STATUS_FLOW[current + 1];
      return <div key={job.id} className="rounded-2xl border-2 border-primary bg-card p-4 space-y-4 shadow-md">
        <p className="font-semibold break-words">{job.pickup_location} → {job.destination}</p>
        <p className="text-sm text-muted-foreground">{job.cargo_type} · {STATUS_LABELS[job.status]}</p>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Delivery progress">
          {STATUS_FLOW.map((step, index) => <li key={step} aria-current={index === current ? 'step' : undefined}
            className={`rounded-xl p-3 text-xs font-semibold ${index <= current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} ${index === current ? 'ring-2 ring-offset-2 ring-primary' : ''}`}>
            {index < current ? '✓' : index + 1}. {STATUS_LABELS[step]}
          </li>)}
        </ol>
        <Link to={`/driver/job/${job.id}#delivery-progress`} className="flex flex-col items-center rounded-xl bg-primary text-primary-foreground p-3 font-semibold">
          <span>Open delivery</span>
          <span className="text-xs font-normal">Next: {next ? STATUS_LABELS[next] : 'Complete delivery'}</span>
        </Link>
      </div>;
    })}
    <Dialog open={unseen.length > 0} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto rounded-2xl" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogTitle>You have a delivery in progress</DialogTitle>
        <DialogDescription>Open your delivery to review progress and update the next step.</DialogDescription>
        {unseen.map((job) => <div key={job.id} className="space-y-2 border-b pb-4">
          <p className="font-semibold break-words">{job.pickup_location} → {job.destination}</p>
          <p className="text-sm text-muted-foreground">{STATUS_LABELS[job.status]}</p>
          <Link onClick={close} to={`/driver/job/${job.id}#delivery-progress`} className="block text-center rounded-xl bg-primary text-primary-foreground p-3 font-semibold">Open delivery</Link>
        </div>)}
        <button onClick={close} className="rounded-xl border py-3 text-sm font-medium">Stay on main screen</button>
      </DialogContent>
    </Dialog>
  </section>;
}
