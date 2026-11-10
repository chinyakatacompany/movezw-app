import { toast as sonnerToast } from "sonner";

export function toast({ title = undefined, description = undefined, variant = undefined } = {}) {
  const opts = description ? { description } : undefined;
  if (variant === "destructive") {
    return sonnerToast.error(title, opts);
  }
  return sonnerToast(title, opts);
}

export function useToast() {
  return { toast };
}
