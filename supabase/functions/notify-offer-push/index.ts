import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, initWebPush, getServiceRoleKey, sendPushToUsers } from "../_shared/push.ts";

const { publicKey, privateKey } = initWebPush();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = getServiceRoleKey();

// Triggered client-side right after a driver submits a quote on a request
// (see DriverJobDetail.jsx), so the customer gets a real push notification
// — even with the app backgrounded — the moment a driver responds.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!publicKey || !privateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500, headers: corsHeaders });
    }
    if (!SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "No service role / secret key available" }), { status: 500, headers: corsHeaders });
    }

    const { offerId } = await req.json();
    if (!offerId) {
      return new Response(JSON.stringify({ error: "offerId required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: offer, error: offerErr } = await supabase
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .single();
    if (offerErr || !offer) throw offerErr ?? new Error("Offer not found");

    const { data: request, error: reqErr } = await supabase
      .from("transport_requests")
      .select("id, customer_id, cargo_type")
      .eq("id", offer.request_id)
      .single();
    if (reqErr || !request) throw reqErr ?? new Error("Request not found");

    const sent = await sendPushToUsers(supabase, [request.customer_id], (_userId, vibration) =>
      JSON.stringify({
        title: "New quote received 💬",
        body: `${offer.driver_name} quoted $${offer.price} for your ${request.cargo_type} request.`,
        url: `/customer/request/${request.id}`,
        vibration,
        tag: `movezw-offer-${offer.id}`,
      })
    );

    return new Response(JSON.stringify({ sent }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
