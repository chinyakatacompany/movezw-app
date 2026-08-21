import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

// Placeholder text that technically counts as a non-empty .message but
// tells the reader nothing — confirmed from a live Supabase auth-js failure:
// AuthRetryableFetchError (thrown for a 5xx it treats as retryable, e.g. our
// email provider rejecting a send) sets its own .message to the literal
// string "{}", which passes any plain truthy/non-empty check.
const USELESS_MESSAGES = new Set(["{}", "[object Object]", "null", "undefined"]);

// Supabase/network errors don't always carry a usable .message (a raw
// network-layer failure, an aborted request, or a plain JS Error thrown
// somewhere in the chain can all end up with no enumerable message, or with
// one of the placeholders above) — used raw, those render as a blank or
// garbled error banner instead of telling the person what happened. Falls
// back to a generic, still-actionable message.
export function getErrorMessage(err, fallback = "Something went wrong. Please check your connection and try again.") {
  if (typeof err === "string" && err.trim() && !USELESS_MESSAGES.has(err.trim())) return err.trim();
  const msg = err?.message;
  if (typeof msg === "string" && msg.trim() && !USELESS_MESSAGES.has(msg.trim())) return msg.trim();
  return fallback;
}
