import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, initWebPush, getServiceRoleKey, sendPushToUsers } from "../_shared/push.ts";
import { sendNativePushToUsers } from "../_shared/nativePush.ts";

const { publicKey, privateKey } = initWebPush();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = getServiceRoleKey();

const VEHICLE_CAPACITY_TONS: Record<string, number> = {
  Motorcycle: 0.25,
  "Small Delivery Vehicle": 0.5,
  Pickup: 1,
  "Cargo Van": 1.5,
  "1 Ton Truck": 1,
  "3 Ton Truck": 3,
  "5 Ton Truck": 5,
  "10 Ton Truck": 10,
  "15 Ton Truck": 15,
  "16 Ton Truck": 16,
  "20 Ton Truck": 20,
  "30 Ton Truck": 30,
  "40 Ton Truck": 40,
  "Articulated Truck": 40,
};

function cargoWeightTons(value: unknown): number | null {
  const text = String(value ?? "").trim().toLowerCase().replaceAll(",", "");
  const amount = Number(text.match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return /(^|[^a-z])(t|ton|tons|tonne|tonnes)([^a-z]|$)/.test(text) ? amount : amount / 1000;
}

function notificationBand(tons: number | null | undefined): string | null {
  if (!Number.isFinite(tons) || Number(tons) <= 0) return null;
  if (Number(tons) <= 10) return "up_to_10";
  if (Number(tons) <= 20) return "over_10_to_20";
  return "over_20_to_articulated";
}

function requestNotificationBand(request: Record<string, unknown>): string | null {
  const values = [
    VEHICLE_CAPACITY_TONS[String(request.vehicle_type ?? "")],
    cargoWeightTons(request.cargo_weight),
  ].filter((value): value is number => Number.isFinite(value));
  return notificationBand(values.length ? Math.max(...values) : null);
}

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

    const drivers: Array<{ user_id: string; vehicle_type: string | null }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error: drvErr } = await supabase
        .from("driver_profiles")
        .select("user_id, vehicle_type")
        .eq("availability_status", "online")
        .eq("verification_status", "approved")
        .range(offset, offset + 999);
      if (drvErr) throw drvErr;
      drivers.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const requestBand = requestNotificationBand(request);
    const driverIds = drivers
      .filter((driver: { vehicle_type: string | null }) =>
        notificationBand(VEHICLE_CAPACITY_TONS[driver.vehicle_type ?? ""]) === requestBand
      )
      .map((driver: { user_id: string }) => driver.user_id);

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
