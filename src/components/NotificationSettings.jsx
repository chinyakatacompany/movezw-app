import React, { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { pushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// Browsers don't expose a way to pick a custom notification *sound* — only
// the vibration pattern is actually controllable via the Notification API,
// so that's what the driver gets to choose here.
const VIBRATION_OPTIONS = [
  { id: "default", label: "Short buzz" },
  { id: "long", label: "Long buzz" },
  { id: "double", label: "Double pulse" },
  { id: "off", label: "Silent" },
];

export default function NotificationSettings({ profile, onProfileChange }) {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    getExistingSubscription()
      .then((sub) => { if (active) { setSubscribed(!!sub); setChecking(false); } })
      .catch(() => active && setChecking(false));
    return () => { active = false; };
  }, []);

  const enable = async () => {
    setLoading(true);
    try {
      await subscribeToPush(user.id);
      setSubscribed(true);
      toast({ title: "Job alerts enabled", description: "You'll get a notification even if the app is in the background." });
    } catch (e) {
      toast({ title: "Could not enable notifications", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      toast({ title: "Job alerts turned off" });
    } catch (e) {
      toast({ title: "Could not disable notifications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const setVibration = async (pattern) => {
    const { error } = await supabase.from("driver_profiles").update({ notification_vibration: pattern }).eq("id", profile.id);
    if (!error) onProfileChange({ ...profile, notification_vibration: pattern });
  };

  if (!pushSupported()) {
    return (
      <div className="bg-card rounded-2xl border border-border p-4 card-shadow">
        <p className="text-sm font-semibold flex items-center gap-2"><BellOff className="w-4 h-4 text-muted-foreground" /> Job alerts</p>
        <p className="text-xs text-muted-foreground mt-1">Push notifications aren't supported on this browser/device.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 card-shadow space-y-3">
      <div>
        <p className="text-sm font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /> Job alerts</p>
        <p className="text-xs text-muted-foreground mt-0.5">Get notified the moment a matching job comes in, even with the app in the background.</p>
      </div>
      {checking ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : subscribed ? (
        <>
          <button onClick={disable} disabled={loading} className="text-xs font-semibold text-muted-foreground hover:text-destructive">
            {loading ? "Turning off..." : "Turn off alerts on this device"}
          </button>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Vibration pattern</p>
            <div className="grid grid-cols-4 gap-1.5">
              {VIBRATION_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setVibration(o.id)}
                  className={cn(
                    "rounded-lg border-2 px-1.5 py-2 text-[11px] font-medium text-center transition-colors",
                    (profile.notification_vibration || "default") === o.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <button
          onClick={enable}
          disabled={loading}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          {loading ? "Enabling..." : "Enable job alert notifications"}
        </button>
      )}
    </div>
  );
}
