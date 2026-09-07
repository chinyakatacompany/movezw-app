import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, initWebPush, getServiceRoleKey, sendPushToUsers } from "../_shared/push.ts";
import { sendNativePushToUsers } from "../_shared/nativePush.ts";

const { publicKey, privateKey } = initWebPush();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = getServiceRoleKey();

interface PickupAlert {
  recipient_user_id: string;
  alert_title: string;
  alert_body: string;
  alert_url: string;
  alert_tag: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const authorization = req.headers.get("authorization");
  const apiKey = req.headers.get("apikey");
  if (!SERVICE_ROLE_KEY || authorization !== `Bearer ${SERVICE_ROLE_KEY}` || apiKey !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc("claim_due_scheduled_pickup_alerts");
    if (error) throw error;
    const alerts = (data ?? []) as PickupAlert[];
    let webSent = 0;
    let nativeSent = 0;

    await Promise.all(alerts.map(async (alert) => {
      const buildPayload = () => ({
        title: alert.alert_title,
        body: alert.alert_body,
        url: alert.alert_url,
        tag: alert.alert_tag,
      });
      const [webCount, nativeCount] = await Promise.all([
        publicKey && privateKey
          ? sendPushToUsers(supabase, [alert.recipient_user_id], (_userId, vibration) =>
            JSON.stringify({ ...buildPayload(), vibration }))
          : 0,
        sendNativePushToUsers(supabase, [alert.recipient_user_id], buildPayload),
      ]);
      webSent += webCount;
      nativeSent += nativeCount;
    }));

    return new Response(JSON.stringify({ alerts: alerts.length, webSent, nativeSent }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
