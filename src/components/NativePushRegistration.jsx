import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
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

  useEffect(() => {
    if (!user?.id || Capacitor.getPlatform() !== "android") return;
    let cancelled = false;

    const registrationListener = PushNotifications.addListener("registration", async (token) => {
      if (cancelled || !isNativePushEnabled()) return;
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

    const syncRegistration = async () => {
      if (cancelled) return;
      if (!isNativePushEnabled()) {
        await PushNotifications.unregister().catch(() => {});
        await supabase.from("device_push_tokens").delete().eq("user_id", user.id);
        return;
      }
      await enableNativePush();
    };
    const onPreference = () => { void syncRegistration(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncRegistration();
    };

    // Alerts default to on for every fresh install/login and are repaired on
    // resume if Android rotated or invalidated the Firebase token. A stored
    // opt-out is respected and prevents registration until the user enables
    // alerts again from MoveZW settings.
    void syncRegistration();
    window.addEventListener(NATIVE_PUSH_PREFERENCE_EVENT, onPreference);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      registrationListener.then((l) => l.remove());
      errorListener.then((l) => l.remove());
      actionListener.then((l) => l.remove());
      window.removeEventListener(NATIVE_PUSH_PREFERENCE_EVENT, onPreference);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  return null;
}
