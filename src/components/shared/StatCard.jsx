import React from "react";
import { cn } from "@/lib/utils";

const tones = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/15 text-accent",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
};

export default function StatCard({ icon: Icon, label, value, sub, tone = "primary", loading }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 card-shadow animate-fade-in transition-transform hover:-translate-y-0.5">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", tones[tone] || tones.primary)}>
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      {loading ? (
        <div className="skeleton h-8 w-16 rounded-lg" />
      ) : (
        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{value}</p>
      )}
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/80 mt-1">{sub}</p>}
    </div>
  );
}
