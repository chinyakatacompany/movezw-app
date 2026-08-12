import webpush from "npm:web-push@3.6.7";

// Without these headers, the browser's CORS preflight (OPTIONS) request
// fails before the real POST is ever sent — every call from the deployed
// web app would silently never reach the function body.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function initWebPush(): { publicKey: string; privateKey: string } {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  if (publicKey && privateKey) {
    webpush.setVapidDetails("mailto:movezwsupport@gmail.com", publicKey, privateKey);
  }
  return { publicKey, privateKey };
}

// This project uses the newer publishable/secret API key system, so the
// legacy SUPABASE_SERVICE_ROLE_KEY env var isn't populated — read the new
// SUPABASE_SECRET_KEYS JSON map instead, falling back to the legacy var for
// projects that still have it.
export function getServiceRoleKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (secretKeys?.default) return secretKeys.default;
  } catch {
    // fall through
  }
  return "";
}

interface PushSub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// deno-lint-ignore no-explicit-any
export async function sendPushToUsers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userIds: string[],
  buildPayload: (userId: string, vibration: string) => string
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, notification_vibration")
    .in("id", userIds);
  const vibrationByUser: Record<string, string> = Object.fromEntries(
    // deno-lint-ignore no-explicit-any
    (profiles ?? []).map((p: any) => [p.id, p.notification_vibration])
  );

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);

  let sent = 0;
  await Promise.all(
    ((subs ?? []) as PushSub[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          // Long buzz by default for anyone who hasn't picked a preference
          // yet in NotificationSettings.jsx — easier to feel/notice than
          // the short double-buzz "default" pattern was.
          buildPayload(s.user_id, vibrationByUser[s.user_id] || "long")
        );
        sent++;
      } catch (err) {
        // 410/404 = subscription is gone (uninstalled, expired) — clean it up.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
  return sent;
}
