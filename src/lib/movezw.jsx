import React from "react";
import { supabase } from "@/api/supabaseClient";
import { cn } from "@/lib/utils";

export const CARGO_TYPES = [
  "Furniture",
  "Building Materials",
  "Groceries",
  "Farm Produce",
  "Parcels",
  "Other",
];

export const VEHICLE_TYPES = [
  "Motorcycle",
  "Pickup",
  "Cargo Van",
  "1 Ton Truck",
  "3 Ton Truck",
  "5 Ton Truck",
  "10 Ton Truck",
  "Articulated Truck",
];

export const VEHICLE_ICONS = {
  Motorcycle: "🏍️",
  Pickup: "🛻",
  "Cargo Van": "🚐",
  "1 Ton Truck": "🚚",
  "3 Ton Truck": "🚚",
  "5 Ton Truck": "🚚",
  "10 Ton Truck": "🚛",
  "Articulated Truck": "🚛",
};

export const REQUEST_STATUSES = [
  "open",
  "confirmed",
  "en_route_pickup",
  "collected",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
];

export const STATUS_LABELS = {
  open: "Open",
  confirmed: "Confirmed",
  en_route_pickup: "En route to pickup",
  collected: "Goods collected",
  in_transit: "In transit",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_FLOW = [
  "confirmed",
  "en_route_pickup",
  "collected",
  "in_transit",
  "delivered",
  "completed",
];

const statusStyles = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  en_route_pickup: "bg-amber-50 text-amber-700 border-amber-200",
  collected: "bg-amber-50 text-amber-700 border-amber-200",
  in_transit: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const dotStyles = {
  open: "bg-blue-500",
  confirmed: "bg-indigo-500",
  en_route_pickup: "bg-amber-500",
  collected: "bg-amber-500",
  in_transit: "bg-amber-500",
  delivered: "bg-emerald-500",
  completed: "bg-emerald-600",
  cancelled: "bg-red-500",
};

export function StatusBadge({ status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
        statusStyles[status] || ""
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dotStyles[status] || "")} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function StarRating({ value = 0, size = "sm" }) {
  const sz = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={cn(sz, n <= Math.round(value) ? "text-amber-400" : "text-slate-200")}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.369 2.446a1 1 0 00-.363 1.118l1.286 3.957c.3.922-.755 1.688-1.54 1.118L10.588 15.6a1 1 0 00-1.176 0l-3.37 2.446c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.063 8.4c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
      ))}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        {Icon && <Icon className="w-7 h-7 text-muted-foreground" />}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground max-w-xs">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function formatMoney(n) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const COMMISSION_RATE = 0.1; // 10% platform commission

// `available` reflects what's actually wired up today, not the eventual
// goal — EcoCash top-ups are a manual admin-approved transfer (see
// Wallet.jsx's top-up flow), and Cash on Delivery is the only supported way
// to pay for a delivery. Everything else here is listed for the roadmap
// but has no working payment flow behind it yet, so the UI must say so
// rather than presenting all of these as equally available.
export const PAYMENT_METHODS = [
  { id: "ecocash", label: "EcoCash", icon: "📱", group: "Mobile money", available: true },
  { id: "onemoney", label: "OneMoney", icon: "📲", group: "Mobile money", available: false },
  { id: "zipit", label: "ZIPIT", icon: "🏦", group: "Bank transfer", available: false },
  { id: "bank", label: "Bank Transfer", icon: "🏦", group: "Bank transfer", available: false },
  { id: "visa", label: "Visa", icon: "💳", group: "Card", available: false },
  { id: "mastercard", label: "Mastercard", icon: "💳", group: "Card", available: false },
  { id: "cod", label: "Cash on delivery", icon: "💵", group: "Cash", available: true },
];

export async function createNotification(userId, type, title, message, link) {
  try {
    await supabase.from("notifications").insert({ user_id: userId, type, title, message, link });
  } catch (e) {
    /* best-effort */
  }
}

export const ZW_CITIES = {
  harare: [-17.8252, 31.0335],
  bulawayo: [-20.1691, 28.5912],
  mutare: [-18.9716, 32.8795],
  gweru: [-19.45, 29.8],
  masvingo: [-20.0748, 30.8326],
  kwekwe: [-18.92, 29.82],
  kadoma: [-18.33, 29.9],
  chinhoyi: [-17.3667, 30.2],
  marondera: [-18.1833, 31.4667],
  chipinge: [-20.2333, 32.5833],
  bindura: [-17.3, 31.3],
  "victoria falls": [-25.8389, 28.8089],
};

export function geocodeZw(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (ZW_CITIES[key]) return ZW_CITIES[key];
  for (const [k, v] of Object.entries(ZW_CITIES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

export function jitterPosition(seed, base = [-19.0, 29.85], spread = 3.2) {
  let h = 0;
  for (let i = 0; i < (seed || "x").length; i++) h = (h * 31 + (seed || "x").charCodeAt(i)) >>> 0;
  const r1 = (h % 1000) / 1000;
  const r2 = ((h >> 10) % 1000) / 1000;
  return [base[0] + (r1 - 0.5) * spread, base[1] + (r2 - 0.5) * spread];
}

export const STATUS_COLORS = {
  open: "#1d4ed8",
  confirmed: "#4338ca",
  en_route_pickup: "#d97706",
  collected: "#d97706",
  in_transit: "#d97706",
  delivered: "#059669",
  completed: "#047857",
  cancelled: "#dc2626",
};

export function shipmentPosition(driverProfile, request) {
  if (driverProfile?.latitude && driverProfile?.longitude) {
    return [driverProfile.latitude, driverProfile.longitude];
  }
  return geocodeZw(request?.destination) || jitterPosition(request?.id || "x");
}

const CUSTOMER_STATUS_MSGS = {
  en_route_pickup: { title: "Your driver is on the way 🚚", body: (r) => `Your driver is heading to pick up your ${r.cargo_type} from ${r.pickup_location}.` },
  collected: { title: "Goods collected 📦", body: (r) => `Your driver has collected your ${r.cargo_type} from ${r.pickup_location}.` },
  in_transit: { title: "In transit 🛣️", body: (r) => `Your ${r.cargo_type} is on the move to ${r.destination}.` },
  delivered: { title: "Delivered ✅", body: (r) => `Your ${r.cargo_type} has been delivered to ${r.destination}.` },
  completed: { title: "Job completed 🎉", body: (r) => `Your delivery to ${r.destination} is complete. Please rate your driver.` },
};

const DRIVER_STATUS_MSGS = {
  cancelled: { title: "Job cancelled", body: (r) => `The customer cancelled the ${r.cargo_type} request from ${r.pickup_location}.` },
};

// Automated, contextual notifications for both customers and drivers on every job status change.
export async function notifyJobStatusChange(request, newStatus, actorUserId) {
  try {
    if (actorUserId !== request.customer_id && CUSTOMER_STATUS_MSGS[newStatus]) {
      const m = CUSTOMER_STATUS_MSGS[newStatus];
      await createNotification(request.customer_id, "status_update", m.title, m.body(request), `/customer/request/${request.id}`);
    }
    if (request.accepted_driver_id && actorUserId !== request.accepted_driver_id && DRIVER_STATUS_MSGS[newStatus]) {
      const m = DRIVER_STATUS_MSGS[newStatus];
      await createNotification(request.accepted_driver_id, "status_update", m.title, m.body(request), `/driver/job/${request.id}`);
    }
  } catch {
    /* best-effort */
  }
}
