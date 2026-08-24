import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Public by design (it's the same key the client bundle ships), used only to
// resolve the caller's own identity from their JWT below -- never to bypass RLS.
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_zagKnQO6bBT3xo6J61bmPw_jMkNzSfh";

// This project uses the newer publishable/secret API key system, so the
// legacy SUPABASE_SERVICE_ROLE_KEY env var isn't populated -- read the new
// SUPABASE_SECRET_KEYS JSON map instead, falling back to the legacy var.
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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// A job actually in motion -- not just posted -- so deleting the account
// mid-delivery can't strand cargo or a driver. "open" (no driver committed
// yet) and terminal statuses are fine to walk away from.
const ACTIVE_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Identify the caller from their own verified JWT, never from a
    // client-supplied id in the body -- this endpoint deletes an account,
    // so it must be structurally impossible to pass someone else's id.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Not authenticated." }, 401);
    const uid = caller.id;

    const db = createClient(SUPABASE_URL, getServiceRoleKey());

    const { data: profile, error: profileErr } = await db.from("profiles").select("*").eq("id", uid).single();
    if (profileErr || !profile) return json({ error: "Profile not found." }, 404);
    if (profile.deleted_at) return json({ error: "This account has already been deleted." }, 400);

    // --- Block conditions: never silently strand a delivery or forfeit real money ---
    const { count: activeAsCustomer } = await db
      .from("transport_requests").select("id", { count: "exact", head: true })
      .eq("customer_id", uid).in("status", ACTIVE_STATUSES);
    if ((activeAsCustomer || 0) > 0) {
      return json({ error: "You have a delivery in progress. Please wait for it to finish, or cancel it, before deleting your account." }, 400);
    }

    const { count: activeAsDriver } = await db
      .from("transport_requests").select("id", { count: "exact", head: true })
      .eq("accepted_driver_id", uid).in("status", ACTIVE_STATUSES);
    if ((activeAsDriver || 0) > 0) {
      return json({ error: "You have a delivery in progress. Please complete it before deleting your account." }, 400);
    }

    const { data: wallet } = await db.from("wallets").select("balance, pending").eq("user_id", uid).maybeSingle();
    if (wallet && (Number(wallet.balance) > 0 || Number(wallet.pending) > 0)) {
      return json({ error: `You have a wallet balance of $${Number(wallet.balance).toFixed(2)}. Please contact support to withdraw your funds before deleting your account.` }, 400);
    }

    const { count: ownedBusinesses } = await db.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", uid);
    if ((ownedBusinesses || 0) > 0) {
      return json({ error: "This account owns a business fleet. Please contact support to close it first." }, 400);
    }

    // --- Decide hard-delete vs. scrub-and-revoke ---
    // messages/offers/ratings/payouts/transactions/return_loads/refund_requests
    // reference profiles.id with NOT NULL, ON DELETE NO ACTION columns --
    // Postgres refuses to delete this row while any of that exists, and it
    // can't be nulled out either (not nullable), so a full delete is only
    // possible for an account with zero such footprint. Also treat "this
    // customer once had an accepted driver on a request" as history, even
    // if they never messaged or rated -- a completed job's transactions
    // reference the request itself, and letting transport_requests cascade
    // out from under a driver's own earnings/transaction records would be
    // exactly the kind of silent data loss this is trying to avoid.
    const checks = await Promise.all([
      db.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", uid),
      db.from("conversations").select("id", { count: "exact", head: true }).or(`customer_id.eq.${uid},driver_id.eq.${uid}`),
      db.from("offers").select("id", { count: "exact", head: true }).eq("driver_id", uid),
      db.from("ratings").select("id", { count: "exact", head: true }).or(`customer_id.eq.${uid},driver_id.eq.${uid}`),
      db.from("payouts").select("id", { count: "exact", head: true }).eq("driver_id", uid),
      db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", uid),
      db.from("return_load_bookings").select("id", { count: "exact", head: true }).or(`customer_id.eq.${uid},driver_id.eq.${uid}`),
      db.from("return_loads").select("id", { count: "exact", head: true }).eq("driver_id", uid),
      db.from("refund_requests").select("id", { count: "exact", head: true }).eq("driver_id", uid),
      db.from("transport_requests").select("id", { count: "exact", head: true }).eq("customer_id", uid).not("accepted_driver_id", "is", null),
    ]);
    for (const { error } of checks) if (error) throw error;
    const hasHistory = checks.some(({ count }) => (count || 0) > 0);

    // Best-effort cleanup of this driver's own private verification files --
    // never blocks deletion either way.
    if (profile.role === "driver") {
      const { data: dp } = await db.from("driver_profiles").select("*").eq("user_id", uid).limit(1).maybeSingle();
      if (dp) {
        const verificationPaths = [dp.national_id_url, dp.driver_licence_url, dp.vehicle_registration_url].filter(Boolean);
        if (verificationPaths.length) {
          try { await db.storage.from("verification-docs").remove(verificationPaths); } catch { /* best-effort */ }
        }
        if (dp.profile_picture_url) {
          try {
            const marker = "/documents/";
            const idx = String(dp.profile_picture_url).indexOf(marker);
            if (idx !== -1) {
              const path = decodeURIComponent(dp.profile_picture_url.slice(idx + marker.length));
              await db.storage.from("documents").remove([path]);
            }
          } catch { /* best-effort */ }
        }
      }
    }

    if (!hasHistory) {
      // Defensive: null out the few remaining nullable-but-non-cascading
      // references so a fresh account can never hit an FK violation here.
      await db.from("audit_logs").update({ actor_id: null }).eq("actor_id", uid);
      await db.from("commission_config").update({ updated_by_id: null }).eq("updated_by_id", uid);
      await db.from("refund_requests").update({ decided_by_id: null }).eq("decided_by_id", uid);
      await db.from("return_loads").update({ accepted_customer_id: null }).eq("accepted_customer_id", uid);
      await db.from("transport_requests").update({ accepted_driver_id: null }).eq("accepted_driver_id", uid);

      const { error: delErr } = await db.auth.admin.deleteUser(uid);
      if (delErr) throw delErr;
      return json({ ok: true, mode: "deleted" });
    }

    // Fully private data with no counterparty stake -- safe to remove outright.
    await db.from("notifications").delete().eq("user_id", uid);
    await db.from("device_push_tokens").delete().eq("user_id", uid);
    await db.from("push_subscriptions").delete().eq("user_id", uid);
    await db.from("driver_profiles").delete().eq("user_id", uid);
    if (wallet) await db.from("wallets").delete().eq("user_id", uid); // balance/pending already verified as zero above

    // Withdraw any still-open listing so nobody sees a live request from a deleted account
    await db.from("transport_requests").update({ status: "cancelled" }).eq("customer_id", uid).eq("status", "open");

    await db.from("audit_logs").insert({
      actor_id: uid,
      actor_name: profile.full_name || null,
      action: "account_deleted",
      entity_type: "profile",
      entity_id: uid,
      details: `User self-deleted their account (role: ${profile.role}).`,
    });

    // Scrub the identifying fields in place -- the row itself can't be
    // deleted (see above) so this is what "delete my account" actually
    // means for anyone with real history, matching what Privacy.jsx and
    // DeleteAccount.jsx already promise: identifiers removed, historical
    // records retained. Deliberately doesn't also set is_suspended here --
    // trg_prevent_self_role_escalation blocks any change to that column
    // unless the caller is an authenticated admin (auth.uid() is null under
    // this service-role connection, so is_admin() reads false), and login
    // is already fully revoked below regardless.
    await db.from("profiles").update({
      full_name: "Deleted user",
      phone: null,
      deleted_at: new Date().toISOString(),
    }).eq("id", uid);

    // Revoke login outright. Drivers additionally lose their email so it's
    // free for a future signup; anonymous customers have none to change.
    const revoke: Record<string, unknown> = {
      ban_duration: "876000h",
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: {},
    };
    if (profile.role === "driver" && caller.email) {
      revoke.email = `deleted-${uid}@movezw.deleted.internal`;
      revoke.email_confirm = true;
    }
    const { error: revokeErr } = await db.auth.admin.updateUserById(uid, revoke);
    if (revokeErr) throw revokeErr;

    return json({ ok: true, mode: "scrubbed" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
