import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, initWebPush, getServiceRoleKey, sendPushToUsers } from "../_shared/push.ts";
import { sendNativePushToUsers, verifyNativePushConfiguration } from "../_shared/nativePush.ts";

const { publicKey, privateKey } = initWebPush();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = getServiceRoleKey();

// Called after database commit and by a minute-by-minute recovery cron.
// Claims a lease before sending: concurrent dispatches don't send the same job.
Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  if (!SERVICE_ROLE_KEY) return respond({ error: "Server push is not configured" }, 503);
  const workerToken = req.headers.get("x-movezw-job-token");
  if (!workerToken || workerToken.length < 32) return respond({ error: "Unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const { data: authorized, error: authorizationError } = await supabase.rpc("authorize_driver_job_push", { p_token: workerToken });
    if (authorizationError || authorized !== true) return respond({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.health === true) {
      return respond({ database: true, webConfigured: Boolean(publicKey && privateKey), androidAuthenticated: await verifyNativePushConfiguration() });
    }
    const { data: jobs, error } = await supabase.rpc("claim_driver_job_push_batch");
    if (error) throw error;
    let completed = 0;
    const failures: string[] = [];
    for (const job of jobs ?? []) {
      try {
        const { data: request, error: requestError } = await supabase.from("transport_requests").select("*").eq("id", job.request_id).single();
        if (requestError) throw requestError;
        const start = request.timing === "scheduled" ? request.scheduled_date || request.created_at : request.created_at;
        const expired = request.expired_at || Date.now() >= Date.parse(start) + 24 * 60 * 60 * 1000;
        if (request.status === "open" && !request.accepted_driver_id && !expired) {
          const recipients: string[] = [];
          for (let offset = 0; ; offset += 500) {
            const { data, error: recipientsError } = await supabase.rpc("driver_job_push_recipients", { p_request: request.id })
              .order("user_id").range(offset, offset + 499);
            if (recipientsError) throw recipientsError;
            recipients.push(...(data ?? []).map((n: { user_id: string }) => n.user_id));
            if (!data || data.length < 500) break;
          }
          const uniqueIds = [...new Set(recipients)];
          const payload = () => ({
            title: "New transport job",
            body: `${request.cargo_type} · ${request.pickup_location} → ${request.destination}`,
            url: `/driver/job/${request.id}`,
            tag: `movezw-job-${request.id}`,
          });
          for (let start = 0; start < uniqueIds.length; start += 100) {
            const ids = uniqueIds.slice(start, start + 100);
            // The RPC rechecks approval, suspension and availability/route
            // eligibility for each attempt, including after a retry.
            const eligible = ids;
            if (!eligible.length) continue;
            if (!publicKey || !privateKey) {
              const { count, error: configError } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).in("user_id", eligible);
              if (configError) throw configError;
              if (count) throw new Error("Web push keys are missing");
            }
            await Promise.all([
              publicKey && privateKey ? sendPushToUsers(supabase, eligible, (_id, vibration) => JSON.stringify({ ...payload(), vibration })) : 0,
              sendNativePushToUsers(supabase, eligible, payload),
            ]);
          }
        }
        // Do not let an expired lease acknowledge a newer worker's attempt.
        const { error: completionError } = await supabase.from("driver_job_push_outbox").update({ delivered_at: new Date().toISOString() })
          .eq("request_id", job.request_id).eq("attempts", job.attempts);
        if (completionError) throw completionError;
        completed++;
      } catch (error) {
        console.error("Driver job push deferred:", job.request_id, error);
        failures.push(job.request_id);
      }
    }
    return respond({ completed, retrying: failures.length });
  } catch (error) {
    console.error("Driver push worker failed:", error);
    return respond({ error: "Could not dispatch job alerts" }, 500);
  }
});
