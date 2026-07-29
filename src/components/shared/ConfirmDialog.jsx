import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmText = "Confirm", cancelText = "Cancel", destructive }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl card-shadow-lg p-5 w-full max-w-sm animate-rise" role="alertdialog" aria-modal="true">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={onClose}>{cancelText}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={() => { onConfirm?.(); onClose?.(); }}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
