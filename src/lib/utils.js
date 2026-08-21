import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Supabase/network errors don't always carry a usable .message (a raw
// network-layer failure, an aborted request, or a plain JS Error thrown
// somewhere in the chain can all end up with no enumerable message) — used
// raw, those render as a blank or garbled error banner instead of telling
// the person what happened. Falls back to a generic, still-actionable message.
export function getErrorMessage(err, fallback = "Something went wrong. Please check your connection and try again.") {
  if (typeof err === "string" && err.trim()) return err;
  if (err?.message && typeof err.message === "string" && err.message.trim()) return err.message;
  return fallback;
}
