import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Navigation, Clock, DollarSign, Package } from "lucide-react";
import { StatusBadge, formatMoney, timeAgo, VEHICLE_ICONS } from "@/lib/movezw";

export default function RequestCard({ request, to, showCustomer = false, rightSlot, distanceKm, tripDistanceKm }) {
  return (
    <Link
      to={to}
      className="block bg-card rounded-2xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 text-primary">
            <Package className="w-5 h-5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">{request.cargo_type}</p>
            {showCustomer && request.accepted_driver_id && (
              <p className="text-xs text-muted-foreground">{request.customer_name || "Customer"}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {request.batch_total > 1 && (
            <span className="text-[11px] font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full whitespace-nowrap">
              Load {request.batch_index} of {request.batch_total}
            </span>
          )}
          <StatusBadge status={request.status} />
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <span className="text-foreground truncate">{request.pickup_location}</span>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <Navigation className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-foreground truncate">{request.destination}</span>
        </div>
        {tripDistanceKm != null && (
          <p className="text-xs font-semibold text-primary pl-6">
            ~{tripDistanceKm < 1 ? `${Math.round(tripDistanceKm * 1000)} m` : `${tripDistanceKm.toFixed(1)} km`} trip distance (straight-line estimate)
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            {formatMoney(request.accepted_price ?? request.budget)}
          </span>
          {request.vehicle_type && (
            <span className="inline-flex items-center gap-1">
              {VEHICLE_ICONS[request.vehicle_type] || "🚚"} {request.vehicle_type}
            </span>
          )}
          {distanceKm != null && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m away` : `${distanceKm.toFixed(1)} km away`}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {timeAgo(request.created_at)}
          </span>
        </div>
        {rightSlot}
      </div>
    </Link>
  );
}
