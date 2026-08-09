import React, { useState } from "react";
import { Truck, Delete } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasPin, verifyPin, consumeFreshLogin } from "@/lib/pinLock";

// Sits between auth resolving and the routed app — if the signed-in user
// has a PIN set on this device and this isn't the one reload right after a
// real password login, this replaces the route with a PIN screen instead
// of rendering it. "Unlocked" is plain React state from here on — it only
// needs to survive client-side navigation, not reloads (see pinLock.js).
// Mount after AuthenticatedApp's isLoadingAuth check so `user` is already
// settled by the time the lazy useState below evaluates.
export default function PinGate({ children }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [unlocked, setUnlocked] = useState(() => consumeFreshLogin(user?.id));
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const locked = isAuthenticated && hasPin(user?.id) && !unlocked;
  if (!locked) return children;

  const press = async (d) => {
    if (checking) return;
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    setError(false);
    if (next.length < 4) return;
    setChecking(true);
    const ok = await verifyPin(user.id, next);
    if (ok) {
      setUnlocked(true);
    } else {
      setError(true);
      setDigits("");
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/5 to-background px-4">
      <div className="w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-sm mx-auto mb-6">
          <Truck className="w-7 h-7 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold">Enter your PIN</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Welcome back{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
        </p>

        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 ${
                error ? "border-destructive" : i < digits.length ? "border-primary bg-primary" : "border-border"
              }`}
            />
          ))}
        </div>
        {error && <p className="text-sm text-destructive mb-4">Incorrect PIN, try again.</p>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className="h-14 rounded-2xl bg-card border border-border text-lg font-semibold hover:bg-muted transition-colors"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => press("0")}
            className="h-14 rounded-2xl bg-card border border-border text-lg font-semibold hover:bg-muted transition-colors"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setDigits((d) => d.slice(0, -1))}
            className="h-14 rounded-2xl flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button type="button" onClick={logout} className="text-sm text-primary font-medium hover:underline">
          Forgot PIN? Use email &amp; password instead
        </button>
      </div>
    </div>
  );
}
