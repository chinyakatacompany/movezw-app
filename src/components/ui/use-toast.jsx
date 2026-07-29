import { toast as sonnerToast } from "sonner";

export function toast({ title, description, variant } = {}) {
  const opts = description ? { description } : undefined;
  if (variant === "destructive") {
    return sonnerToast.error(title, opts);
  }
  return sonnerToast(title, opts);
}

export function useToast() {
  return { toast };
}
