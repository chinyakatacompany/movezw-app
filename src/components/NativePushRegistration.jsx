import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { DRIVER_ALERT_EVENT } from "@/lib/driverJobAlerts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  isNativePushEnabled,
  NATIVE_PUSH_PREFERENCE_EVENT,
  setNativePushPreference,
} from "@/lib/devicePreferences";

export async function enableNativePush() {
  if (!isNativePushEnabled()) setNativePushPreference(true);
  let status = await PushNotifications.checkPermissions();
  if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
    status = await PushNotifications.requestPermissions();
  }
  if (status.receive !== "granted") return false;
  await PushNotifications.register();
  return true;
}

export async function disableNativePush(userId) {
  if (isNativePushEnabled()) setNativePushPreference(false);
  await PushNotifications.unregister().catch(() => {});
  if (userId) await supabase.from("device_push_tokens").delete().eq("user_id", userId);
}

// Web push (see push_subscriptions / sw.js) only survives while the browser
// process is still alive in the background — on Android, once the app is
// swiped away or killed by battery optimization, it silently stops
// receiving job alerts. This registers the installed app for real FCM push,
// which Android's OS wakes the app process for even from fully killed —
// same mechanism WhatsApp/Uber-style apps rely on. No-ops entirely on web,
// where this plugin isn't available.
export default function NativePushRegistration() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id || Capacitor.getPlatform() !== "android") return;
    let cancelled = false;

    const registrationListener = PushNotifications.addListener("registration", async (token) => {
      if (cancelled || !isNativePushEnabled()) return;
      const { error } = await supabase.from("device_push_tokens").upsert(
        { user_id: user.id, token: token.value, platform: "android" },
        { onConflict: "token" }
      );
      if (error) console.error("Could not save device push token:", error);
    });
    const errorListener = PushNotifications.addListener("registrationError", (err) => {
      console.error("FCM registration failed:", err);
    });
    const receivedListener = PushNotifications.addListener("pushNotificationReceived", () => {
      window.dispatchEvent(new Event(DRIVER_ALERT_EVENT));
    });
    const actionListener = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action.notification?.data?.url;
      if (url && /^\/(?!\/)/.test(url)) navigate(url);
    });

    const syncRegistration = async () => {
      if (cancelled) return;
      if (!isNativePushEnabled()) {
        await PushNotifications.unregister().catch(() => {});
        await supabase.from("device_push_tokens").delete().eq("user_id", user.id);
        return;
      }
      await enableNativePush();
    };
    const onPreference = () => { void syncRegistration().catch(console.error); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncRegistration().catch(console.error);
    };

    // Alerts default to on for every fresh install/login and are repaired on
    // resume if Android rotated or invalidated the Firebase token. A stored
    // opt-out is respected and prevents registration until the user enables
    // alerts again from MoveZW settings.
    void Promise.all([registrationListener, errorListener, actionListener, receivedListener])
      .then(syncRegistration).catch((error) => console.error("Could not enable push alerts:", error));
    window.addEventListener(NATIVE_PUSH_PREFERENCE_EVENT, onPreference);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      registrationListener.then((l) => l.remove());
      errorListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
      receivedListener.then((l) => l.remove());
      window.removeEventListener(NATIVE_PUSH_PREFERENCE_EVENT, onPreference);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, navigate]);

  return null;
}
