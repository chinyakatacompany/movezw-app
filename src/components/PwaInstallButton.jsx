import React from "react";
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { cn } from "@/lib/utils";

export default function PwaInstallButton({ className, children = "Install MoveZW", onClick }) {
  const { showInstall, promptInstall } = useInstallPrompt();

  if (!showInstall) return null;

  const install = async (event) => {
    onClick?.(event);
    await promptInstall();
  };

  return (
    <button
      type="button"
      onClick={install}
      className={cn("inline-flex items-center justify-center gap-2", className)}
    >
      <Download className="w-4 h-4" aria-hidden="true" />
      {children}
    </button>
  );
}
