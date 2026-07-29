import React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2 } from "lucide-react";

export function Skeleton({ className }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function SkeletonCard({ lines = 3, className }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border p-5 space-y-3", className)}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function LoadingScreen({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
        <AlertCircle className="w-7 h-7" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message || "Something went wrong. Please try again."}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-semibold text-primary hover:underline">Try again</button>
      )}
    </div>
  );
}
