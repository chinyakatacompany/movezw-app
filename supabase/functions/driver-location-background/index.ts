import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ACTIVE_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getServiceRoleKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (secretKeys?.default) return secretKeys.default;
  } catch { /* fall through */ }
  return "";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-movezw-request-id, x-movezw-tracking-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) return json({ error: "Background tracking is not configured." }, 500);
  const db = createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "location";

    if (action === "start" || action === "stop") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user }, error: authError } = await callerClient.auth.getUser();
      if (authError || !user) return json({ error: "Not authenticated." }, 401);

      const requestId = typeof body?.request_id === "string" ? body.request_id : "";
      if (!UUID_PATTERN.test(requestId)) return json({ error: "Invalid request id." }, 400);

      const { data: trip, error: tripError } = await db
        .from("transport_requests")
        .select("id, accepted_driver_id, status")
        .eq("id", requestId)
        .maybeSingle();
      if (tripError) throw tripError;
      if (!trip || trip.accepted_driver_id !== user.id) {
        return json({ error: "Only the assigned driver can manage tracking." }, 403);
      }

      if (action === "stop") {
        const { error } = await db.from("driver_tracking_sessions")
          .delete()
          .eq("request_id", requestId)
          .eq("driver_id", user.id);
        if (error) throw error;
        return json({ ok: true });
      }

      if (!ACTIVE_STATUSES.includes(trip.status)) {
        return json({ error: "This delivery is not active." }, 409);
      }

      const trackingToken = randomToken();
      const tokenHash = await sha256(trackingToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: sessionError } = await db.from("driver_tracking_sessions").upsert({
        request_id: requestId,
        driver_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "request_id" });
      if (sessionError) throw sessionError;
      return json({ tracking_token: trackingToken, expires_at: expiresAt });
    }

    const requestId = req.headers.get("x-movezw-request-id") ?? "";
    const trackingToken = req.headers.get("x-movezw-tracking-token") ?? "";
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    if (!UUID_PATTERN.test(requestId) || trackingToken.length < 32) {
      return json({ error: "Invalid tracking credential." }, 401);
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return json({ error: "Invalid coordinates." }, 400);
    }

    const tokenHash = await sha256(trackingToken);
    const { data: session, error: sessionError } = await db
      .from("driver_tracking_sessions")
      .select("request_id, driver_id, expires_at")
      .eq("request_id", requestId)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
      return json({ error: "Tracking session expired." }, 401);
    }

    const { data: trip, error: tripError } = await db
      .from("transport_requests")
      .select("accepted_driver_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (tripError) throw tripError;
    if (!trip || trip.accepted_driver_id !== session.driver_id || !ACTIVE_STATUSES.includes(trip.status)) {
      await db.from("driver_tracking_sessions").delete().eq("request_id", requestId);
      return json({ error: "Delivery tracking has ended." }, 409);
    }

    const { error: updateError } = await db.from("transport_requests")
      .update({
        driver_lat: latitude,
        driver_lng: longitude,
        driver_location_updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("accepted_driver_id", session.driver_id);
    if (updateError) throw updateError;
    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
