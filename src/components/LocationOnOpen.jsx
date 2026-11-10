import { useCallback, useEffect, useRef, useState } from "react";
import { requestCurrentLocation } from "@/lib/geo";

export default function LocationOnOpen() {
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);
  const pending = useRef(false);
  const check = useCallback(async () => {
    if (document.visibilityState !== "visible" || pending.current) return;
    pending.current = true;
    setChecking(true);
    try {
      await requestCurrentLocation();
      setProblem("");
    } catch (error) {
      setProblem(error.message);
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
    };
  }, [check]);

  return problem ? (
    <aside role="status" className="fixed inset-x-2 top-2 z-50 mx-auto max-w-md rounded-xl border bg-background p-3 text-sm shadow-lg">
      <p>{problem}</p>
      <button type="button" disabled={checking} onClick={check} className="mt-2 font-semibold text-primary">
        {checking ? "Checking location…" : "Check location again"}
      </button>
    </aside>
  ) : null;
}
