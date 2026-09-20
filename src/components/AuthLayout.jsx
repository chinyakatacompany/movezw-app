import React from "react";
import { Truck, Download } from "lucide-react";
import { PLAY_STORE_URL } from "@/lib/appLinks";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children, showInstall }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-sm">
            <Truck className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-2xl tracking-tight">MoveZW</span>
        </div>

        {showInstall && (
          <div className="flex justify-center mb-6">
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-accent text-accent-foreground text-sm font-semibold shadow-md shadow-accent/25 hover:bg-accent/90 transition-colors animate-pulse-subtle"
            >
              <Download className="w-4 h-4" /> Get it on Google Play
            </a>
          </div>
        )}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Icon className="w-7 h-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
