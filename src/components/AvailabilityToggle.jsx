import React from "react";
import { Wifi, Clock, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "online", label: "Online", icon: Wifi, tone: "emerald" },
  { id: "busy", label: "Busy", icon: Clock, tone: "amber" },
  { id: "offline", label: "Offline", icon: WifiOff, tone: "muted" },
];

const activeTone = {
  emerald: "bg-emerald-500 text-white border-transparent",
  amber: "bg-amber-500 text-white border-transparent",
  muted: "bg-primary text-primary-foreground border-transparent",
};

export default function AvailabilityToggle({ value, onChange, disabled }) {
  const current = value || "offline";
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ id, label, icon: Icon, tone }) => {
        const active = current === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-semibold transition-all disabled:opacity-60",
              active
                ? `${activeTone[tone]} shadow-sm`
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
