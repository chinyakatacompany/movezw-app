import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:movezwsupport@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Triggered client-side right after a customer posts a new request (see
// CreateRequest.jsx), mirroring the existing best-effort in-app matching
// notification pattern. Sends real OS-level push notifications — the only
// way to reach a driver whose phone is locked or app is backgrounded,
// unlike the Supabase realtime subscriptions used elsewhere in the app.
Deno.serve(async (req) => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500 });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "requestId required" }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: request, error: reqErr } = await supabase
      .from("transport_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    if (reqErr || !request) throw reqErr ?? new Error("Request not found");

    const { data: drivers, error: drvErr } = await supabase
      .from("driver_profiles")
      .select("user_id, notification_vibration")
      .eq("availability_status", "online")
      .eq("verification_status", "approved");
    if (drvErr) throw drvErr;

    const driverIds = (drivers ?? []).map((d) => d.user_id);
    if (driverIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", driverIds);
    if (subErr) throw subErr;

    const vibrationByUser = Object.fromEntries((drivers ?? []).map((d) => [d.user_id, d.notification_vibration]));

    const payloadFor = (userId: string) =>
      JSON.stringify({
        title: "New job request nearby",
        body: `${request.cargo_type} · ${request.pickup_location} → ${request.destination}`,
        url: `/driver/job/${request.id}`,
        vibration: vibrationByUser[userId] || "default",
        tag: `movezw-job-${request.id}`,
      });

    let sent = 0;
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
            payloadFor(s.user_id)
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

    return new Response(JSON.stringify({ sent }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
