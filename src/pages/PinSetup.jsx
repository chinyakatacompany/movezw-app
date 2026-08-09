import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Delete } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { hasPin, setPin, removePin, verifyPin } from "@/lib/pinLock";
import { toast } from "@/components/ui/use-toast";

const STEPS = { VERIFY: "verify", CREATE: "create", CONFIRM: "confirm" };

export default function PinSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const existing = hasPin(user?.id);
  const [step, setStep] = useState(existing ? STEPS.VERIFY : STEPS.CREATE);
  const [pendingAction, setPendingAction] = useState("change");
  const [digits, setDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");

  const press = async (d) => {
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    setError("");
    if (next.length < 4) return;

    if (step === STEPS.VERIFY) {
      const ok = await verifyPin(user.id, next);
      if (!ok) {
        setError("Incorrect PIN");
        setDigits("");
        return;
      }
      if (pendingAction === "remove") {
        removePin(user.id);
        toast({ title: "PIN removed", description: "You'll use your password to unlock next time." });
        navigate(-1);
        return;
      }
      setStep(STEPS.CREATE);
      setDigits("");
    } else if (step === STEPS.CREATE) {
      setFirstPin(next);
      setStep(STEPS.CONFIRM);
      setDigits("");
    } else {
      if (next !== firstPin) {
        setError("PINs didn't match — try again");
        setFirstPin("");
        setStep(STEPS.CREATE);
        setDigits("");
        return;
      }
      await setPin(user.id, next);
      toast({ title: existing ? "PIN updated" : "PIN set", description: "You can use it to unlock MoveZW quickly next time." });
      navigate(-1);
    }
  };

  const titles = {
    [STEPS.VERIFY]: pendingAction === "remove" ? "Confirm your PIN to remove it" : "Enter your current PIN",
    [STEPS.CREATE]: existing ? "Enter a new PIN" : "Create a PIN",
    [STEPS.CONFIRM]: "Confirm your PIN",
  };

  return (
    <div className="p-4 sm:p-6 max-w-sm mx-auto pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-xl font-bold">{titles[step]}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A 4-digit PIN to quickly unlock MoveZW on this device — your password stays your real login.
        </p>
      </div>

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
      {error && <p className="text-sm text-destructive text-center mb-4">{error}</p>}

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

      {existing && step === STEPS.VERIFY && pendingAction !== "remove" && (
        <button
          type="button"
          className="w-full text-sm text-destructive font-medium"
          onClick={() => setPendingAction("remove")}
        >
          Remove PIN instead
        </button>
      )}
    </div>
  );
}
