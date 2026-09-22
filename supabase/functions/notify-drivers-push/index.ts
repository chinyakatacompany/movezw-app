import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, initWebPush, getServiceRoleKey, sendPushToUsers } from "../_shared/push.ts";
import { sendNativePushToUsers } from "../_shared/nativePush.ts";

const { publicKey, privateKey } = initWebPush();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = getServiceRoleKey();

// Triggered client-side right after a customer posts a new request (see
// CreateRequest.jsx), mirroring the existing best-effort in-app matching
// notification pattern. Sends real OS-level push notifications — the only
// way to reach a driver whose phone is locked or app is backgrounded,
// unlike the Supabase realtime subscriptions used elsewhere in the app.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "No service role / secret key available" }), { status: 500, headers: corsHeaders });
    }

    const { requestId } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "requestId required" }), { status: 400, headers: corsHeaders });
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
      .select("user_id")
      .eq("availability_status", "online")
      .eq("verification_status", "approved");
    if (drvErr) throw drvErr;

    const driverIds = (drivers ?? []).map((d: { user_id: string }) => d.user_id);

    const buildPayload = () => ({
      title: "New job request nearby",
      body: `${request.cargo_type} · ${request.pickup_location} → ${request.destination}`,
      url: `/driver/job/${request.id}`,
      tag: `movezw-job-${request.id}`,
    });
    const [webSent, nativeSent] = await Promise.all([
      publicKey && privateKey
        ? sendPushToUsers(supabase, driverIds, (_userId, vibration) => JSON.stringify({ ...buildPayload(), vibration }))
        : 0,
      sendNativePushToUsers(supabase, driverIds, buildPayload),
    ]);

    return new Response(JSON.stringify({ sent: webSent + nativeSent, webSent, nativeSent }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
