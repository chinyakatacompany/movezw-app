import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/15 text-accent",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

export default function KPICard({ icon: Icon, label, value, sub, trend, tone = "primary", loading }) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 card-shadow animate-fade-in transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", tones[tone] || tones.primary)}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        {trend != null && !loading && (
          <span className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
            up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          )}>
            {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {loading ? (
        <div className="skeleton h-7 w-20 rounded-lg mt-3" />
      ) : (
        <p className="text-2xl sm:text-[26px] font-bold tracking-tight mt-3 text-foreground">{value}</p>
      )}
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/80 mt-1">{sub}</p>}
    </div>
  );
}
