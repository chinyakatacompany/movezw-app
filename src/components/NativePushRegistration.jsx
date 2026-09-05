import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

// Web push (see push_subscriptions / sw.js) only survives while the browser
// process is still alive in the background — on Android, once the app is
// swiped away or killed by battery optimization, it silently stops
// receiving job alerts. This registers the installed app for real FCM push,
// which Android's OS wakes the app process for even from fully killed —
// same mechanism WhatsApp/Uber-style apps rely on. No-ops entirely on web,
// where this plugin isn't available.
export default function NativePushRegistration() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id || Capacitor.getPlatform() !== "android") return;
    let cancelled = false;

    const registrationListener = PushNotifications.addListener("registration", async (token) => {
      if (cancelled) return;
      await supabase.from("device_push_tokens").upsert(
        { user_id: user.id, token: token.value, platform: "android" },
        { onConflict: "token" }
      );
    });
    const errorListener = PushNotifications.addListener("registrationError", (err) => {
      console.error("FCM registration failed:", err);
    });
    const actionListener = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action.notification?.data?.url;
      if (url && url.startsWith("/")) window.location.assign(url);
    });

    PushNotifications.checkPermissions().then(async (status) => {
      let granted = status.receive === "granted";
      if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
        const req = await PushNotifications.requestPermissions();
        granted = req.receive === "granted";
      }
      if (granted && !cancelled) PushNotifications.register();
    });

    return () => {
      cancelled = true;
      registrationListener.then((l) => l.remove());
      errorListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
    };
  }, [user?.id]);

  return null;
}
