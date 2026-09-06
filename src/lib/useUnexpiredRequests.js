import { useEffect, useState } from "react";
import { isRequestExpired, requestDeadline } from "./requestExpiry";

// Re-render at the next deadline, even when no database event arrives.
// Recheck on resume because background tabs can suspend their timers.
export function useUnexpiredRequests(requests) {
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick((value) => value + 1);
    const now = Date.now();
    const deadlines = (requests || [])
      .filter((r) => r.status === "open" && !r.accepted_driver_id)
      .map(requestDeadline).filter((time) => Number.isFinite(time) && time > now);
    const timer = deadlines.length ? setTimeout(refresh,
      Math.min(Math.min(...deadlines) - now + 1, 2147483647)) : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  });
  return requests == null ? requests : requests.filter((r) => !isRequestExpired(r));
}
