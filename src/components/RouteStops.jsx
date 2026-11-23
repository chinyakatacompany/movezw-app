import React from "react";
export default function RouteStops({request, onComplete, busy = false}) {
 const stops = request?.intermediate_stops || [];
 const completed = request?.completed_stop_count || 0;
 if (!stops.length) return null;
 return <div className="rounded-xl border p-3 space-y-2"><p className="text-sm font-semibold">Additional stops in order</p>{stops.map((s,i) => <div key={i} className="text-sm"><span className="font-medium">{i+1}. {s.label}{i < completed ? " ✓ Completed" : ""}</span><p className="text-xs text-muted-foreground">{s.type === "pickup" ? "Collect goods" : s.type === "both" ? "Collect and drop off" : "Drop off goods"}</p>{onComplete && i === completed && <button type="button" disabled={busy} className="mt-2 rounded-lg border border-primary px-3 py-2 text-primary font-semibold disabled:opacity-50" onClick={() => onComplete(i)}>Confirm stop completed</button>}</div>)}</div>;
}
