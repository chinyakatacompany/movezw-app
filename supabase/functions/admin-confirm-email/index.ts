import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_zagKnQO6bBT3xo6J61bmPw_jMkNzSfh";

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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: "Not authenticated." }, 401);

    const serviceRoleKey = getServiceRoleKey();
    if (!serviceRoleKey) return json({ error: "Email confirmation is not configured." }, 500);
    const db = createClient(SUPABASE_URL, serviceRoleKey);

    const { data: callerProfile, error: callerProfileError } = await db
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", caller.id)
      .single();
    if (callerProfileError || callerProfile?.role !== "admin") {
      return json({ error: "Only an administrator can confirm driver emails." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
      return json({ error: "Invalid driver account id." }, 400);
    }

    const { data: targetProfile, error: targetProfileError } = await db
      .from("profiles")
      .select("id, role, full_name, deleted_at")
      .eq("id", targetUserId)
      .single();
    if (targetProfileError || !targetProfile) return json({ error: "Driver profile not found." }, 404);
    if (targetProfile.role !== "driver") return json({ error: "Only driver emails can be confirmed here." }, 400);
    if (targetProfile.deleted_at) return json({ error: "This driver account has been deleted." }, 400);

    const { data: authResult, error: getUserError } = await db.auth.admin.getUserById(targetUserId);
    if (getUserError || !authResult.user) return json({ error: "Driver authentication account not found." }, 404);
    if (!authResult.user.email) return json({ error: "This driver account has no email address." }, 400);
    if (authResult.user.email_confirmed_at) return json({ ok: true, alreadyConfirmed: true });

    const { error: updateError } = await db.auth.admin.updateUserById(targetUserId, { email_confirm: true });
    if (updateError) throw updateError;

    await db.from("audit_logs").insert({
      actor_id: caller.id,
      actor_name: callerProfile.full_name || "MoveZW Admin",
      action: "driver_email_confirmed",
      entity_type: "profile",
      entity_id: targetUserId,
      details: `Admin manually confirmed the email for driver ${targetProfile.full_name || targetUserId}.`,
    });

    return json({ ok: true, alreadyConfirmed: false });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
