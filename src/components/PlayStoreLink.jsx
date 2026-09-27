import React from "react";
import { Capacitor } from "@capacitor/core";
import { Download } from "lucide-react";
import { PLAY_STORE_URL } from "@/lib/appLinks";
import { cn } from "@/lib/utils";

export default function PlayStoreLink({ className, children = "Android on Google Play" }) {
  // The Play Store build is already installed when this code is running in
  // Capacitor. Never ask those users to install the app they are inside.
  if (Capacitor.isNativePlatform()) return null;

  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center justify-center gap-2", className)}
    >
      <Download className="w-4 h-4" aria-hidden="true" />
      {children}
    </a>
  );
}
