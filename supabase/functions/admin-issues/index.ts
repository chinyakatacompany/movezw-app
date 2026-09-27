import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_zagKnQO6bBT3xo6J61bmPw_jMkNzSfh";
const ACTIVE_JOB_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"];

function getServiceRoleKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys?.default) return keys.default;
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

type Issue = {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  category: "accounts" | "drivers" | "jobs" | "finance" | "notifications";
  title: string;
  description: string;
  subject?: string;
  targetId?: string;
  action?: string;
  actionLabel?: string;
  href?: string;
};

const ageHours = (value?: string | null) => value
  ? (Date.now() - new Date(value).getTime()) / 3_600_000
  : 0;

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
    if (!serviceRoleKey) return json({ error: "Admin issue management is not configured." }, 500);
    const db = createClient(SUPABASE_URL, serviceRoleKey);

    const { data: callerProfile } = await db
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", caller.id)
      .single();
    if (callerProfile?.role !== "admin") return json({ error: "Administrator access required." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "list";
    const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";

    const audit = async (auditAction: string, entityType: string, entityId: string, details: string) => {
      await db.from("audit_logs").insert({
        actor_id: caller.id,
        actor_name: callerProfile.full_name || "MoveZW Admin",
        action: auditAction,
        entity_type: entityType,
        entity_id: entityId,
        details,
      });
    };

    if (action !== "list") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
        return json({ error: "Invalid issue target." }, 400);
      }

      if (action === "confirm_email") {
        const { data: result, error } = await db.auth.admin.getUserById(targetId);
        if (error || !result.user) return json({ error: "Authentication account not found." }, 404);
        if (!result.user.email) return json({ error: "This account has no email address." }, 400);
        if (!result.user.email_confirmed_at) {
          const { error: updateError } = await db.auth.admin.updateUserById(targetId, { email_confirm: true });
          if (updateError) throw updateError;
          await audit("driver_email_confirmed", "profile", targetId, "Admin manually confirmed the driver's email from Issues.");
        }
        return json({ ok: true });
      }

      if (action === "repair_profile") {
        const { data: result, error } = await db.auth.admin.getUserById(targetId);
        if (error || !result.user) return json({ error: "Authentication account not found." }, 404);
        const metadata = result.user.user_metadata || {};
        const role = metadata.role === "driver" ? "driver" : "customer";
        const { error: insertError } = await db.from("profiles").upsert({
          id: targetId,
          full_name: metadata.full_name || "",
          phone: metadata.phone || "",
          role,
        }, { onConflict: "id", ignoreDuplicates: true });
        if (insertError) throw insertError;
        await audit("account_profile_repaired", "profile", targetId, `Admin repaired a missing ${role} application profile.`);
        return json({ ok: true });
      }

      if (action === "fix_driver_role") {
        const { error } = await db.from("profiles").update({ role: "driver" }).eq("id", targetId);
        if (error) throw error;
        await audit("driver_role_repaired", "profile", targetId, "Admin restored the driver role to match the driver's vehicle profile.");
        return json({ ok: true });
      }

      if (action === "unapprove_driver") {
        const { data: driver, error: driverError } = await db
          .from("driver_profiles")
          .select("id, user_id, full_name, verification_status")
          .eq("id", targetId)
          .single();
        if (driverError || !driver) return json({ error: "Driver profile not found." }, 404);
        if (driver.verification_status !== "approved") return json({ error: "This driver is not currently approved." }, 400);
        const reason = "Approval removed by administrator. Documents require another review.";
        const { error } = await db.from("driver_profiles").update({
          verification_status: "pending",
          verification_note: reason,
        }).eq("id", targetId);
        if (error) throw error;
        await Promise.all([
          db.from("notifications").insert({
            user_id: driver.user_id,
            type: "verification",
            title: "Driver approval paused",
            message: "Your driver approval has been returned for review. You cannot accept new jobs until approved again.",
            link: "/driver",
          }),
          audit("driver_unapproved", "driver_profile", targetId, `Admin returned driver ${driver.full_name || driver.user_id} to pending verification.`),
        ]);
        return json({ ok: true });
      }

      return json({ error: "Unsupported repair action." }, 400);
    }

    const [profilesResult, driversResult, jobsResult, topupsResult, tokensResult, subscriptionsResult, authResult] = await Promise.all([
      db.from("profiles").select("*").limit(2000),
      db.from("driver_profiles").select("*").limit(2000),
      db.from("transport_requests").select("*").order("created_at", { ascending: false }).limit(2000),
      db.from("transactions").select("*").eq("type", "topup").eq("status", "pending").limit(1000),
      db.from("device_push_tokens").select("user_id").limit(5000),
      db.from("push_subscriptions").select("user_id").limit(5000),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (driversResult.error) throw driversResult.error;
    if (jobsResult.error) throw jobsResult.error;
    if (authResult.error) throw authResult.error;

    const profiles = profilesResult.data || [];
    const drivers = driversResult.data || [];
    const jobs = jobsResult.data || [];
    const authUsers = authResult.data.users || [];
    const profilesById = new Map(profiles.map((p) => [p.id, p]));
    const driversByUser = new Map(drivers.map((d) => [d.user_id, d]));
    const pushUsers = new Set([
      ...(tokensResult.data || []).map((row) => row.user_id),
      ...(subscriptionsResult.data || []).map((row) => row.user_id),
    ]);
    const issues: Issue[] = [];

    for (const authUser of authUsers) {
      const profile = profilesById.get(authUser.id);
      const metadata = authUser.user_metadata || {};
      if (!profile) {
        issues.push({
          id: `missing-profile-${authUser.id}`,
          type: "missing_profile",
          severity: "critical",
          category: "accounts",
          title: "Authentication account has no app profile",
          description: "The user exists in Supabase Auth but cannot load MoveZW correctly.",
          subject: metadata.full_name || authUser.email || authUser.id,
          targetId: authUser.id,
          action: "repair_profile",
          actionLabel: "Repair profile",
        });
      }
      const role = profile?.role || metadata.role;
      if (role === "driver" && authUser.email && !authUser.email_confirmed_at) {
        issues.push({
          id: `unconfirmed-${authUser.id}`,
          type: "unconfirmed_email",
          severity: "critical",
          category: "accounts",
          title: "Driver email is not confirmed",
          description: "The driver account exists but password login is blocked until an administrator confirms the address.",
          subject: profile?.full_name || metadata.full_name || authUser.email,
          targetId: authUser.id,
          action: "confirm_email",
          actionLabel: "Confirm email",
        });
      }
    }

    for (const profile of profiles) {
      if (profile.deleted_at || profile.role === "admin") continue;
      const driver = driversByUser.get(profile.id);
      if (!profile.phone) {
        issues.push({
          id: `missing-phone-${profile.id}`,
          type: "missing_phone",
          severity: "warning",
          category: "accounts",
          title: "Account has no phone number",
          description: "The administrator should add a reachable phone number from User Management.",
          subject: profile.full_name || profile.id,
          href: "/admin/users",
        });
      }
      if (profile.role === "driver" && !driver) {
        issues.push({
          id: `missing-driver-profile-${profile.id}`,
          type: "missing_driver_profile",
          severity: "warning",
          category: "drivers",
          title: "Driver has not completed onboarding",
          description: "No vehicle or verification profile exists. Admin can upload the documents on the driver's behalf.",
          subject: profile.full_name || profile.id,
          href: `/admin/verification/${profile.id}/onboard`,
        });
      }
    }

    for (const driver of drivers) {
      const profile = profilesById.get(driver.user_id);
      if (profile && profile.role !== "driver") {
        issues.push({
          id: `driver-role-${driver.user_id}`,
          type: "driver_role_mismatch",
          severity: "critical",
          category: "drivers",
          title: "Vehicle profile belongs to a non-driver account",
          description: "Repairing the role restores the correct driver dashboard and permissions.",
          subject: driver.full_name || profile.full_name || driver.user_id,
          targetId: driver.user_id,
          action: "fix_driver_role",
          actionLabel: "Restore driver role",
        });
      }
      const missingDocs = [driver.national_id_url, driver.driver_licence_url, driver.vehicle_registration_url].filter((value) => !value).length;
      if (driver.verification_status === "approved" && missingDocs > 0) {
        issues.push({
          id: `approved-missing-docs-${driver.id}`,
          type: "approved_missing_documents",
          severity: "critical",
          category: "drivers",
          title: "Approved driver has missing documents",
          description: `${missingDocs} required verification document${missingDocs === 1 ? " is" : "s are"} missing. Return the driver to pending review.`,
          subject: driver.full_name || profile?.full_name || driver.user_id,
          targetId: driver.id,
          action: "unapprove_driver",
          actionLabel: "Unapprove driver",
        });
      }
      if (driver.verification_status === "pending" && ageHours(driver.created_at) > 24) {
        issues.push({
          id: `pending-driver-${driver.id}`,
          type: "pending_verification",
          severity: "warning",
          category: "drivers",
          title: "Driver verification is waiting",
          description: "Documents have been pending for more than 24 hours and need an administrator decision.",
          subject: driver.full_name || profile?.full_name || driver.user_id,
          href: "/admin/verification",
        });
      }
      if (driver.verification_status === "approved" && !pushUsers.has(driver.user_id)) {
        issues.push({
          id: `driver-no-push-${driver.id}`,
          type: "missing_push_device",
          severity: "info",
          category: "notifications",
          title: "Approved driver has no push-enabled device",
          description: "Ask the driver to open MoveZW and allow notifications so job alerts can reach the device.",
          subject: driver.full_name || profile?.full_name || driver.user_id,
          href: "/admin/users",
        });
      }
    }

    for (const job of jobs) {
      const active = ACTIVE_JOB_STATUSES.includes(job.status);
      if (job.status === "open" && job.accepted_driver_id) {
        issues.push({
          id: `open-accepted-${job.id}`,
          type: "open_job_with_driver",
          severity: "critical",
          category: "jobs",
          title: "Open job already has an accepted driver",
          description: "The job status and driver assignment disagree. Review the job before changing its status.",
          subject: `${job.pickup_location || "Pickup"} → ${job.destination || "Destination"}`,
          href: "/admin/jobs",
        });
      }
      if (active && !job.accepted_driver_id) {
        issues.push({
          id: `active-no-driver-${job.id}`,
          type: "active_job_without_driver",
          severity: "critical",
          category: "jobs",
          title: "Active job has no assigned driver",
          description: "Review and either assign the correct driver, cancel the job, or correct its delivery status.",
          subject: `${job.pickup_location || "Pickup"} → ${job.destination || "Destination"}`,
          href: "/admin/jobs",
        });
      }
      if (active && ageHours(job.updated_at || job.created_at) > 48) {
        issues.push({
          id: `stale-job-${job.id}`,
          type: "stale_active_job",
          severity: "warning",
          category: "jobs",
          title: "Active job has not progressed for 48 hours",
          description: "Contact both parties, check live tracking, then advance or cancel the job manually.",
          subject: `${job.pickup_location || "Pickup"} → ${job.destination || "Destination"}`,
          href: "/admin/jobs",
        });
      }
      const customer = profilesById.get(job.customer_id);
      const driver = profilesById.get(job.accepted_driver_id);
      if (active && (customer?.is_suspended || driver?.is_suspended)) {
        issues.push({
          id: `suspended-active-job-${job.id}`,
          type: "suspended_user_active_job",
          severity: "critical",
          category: "jobs",
          title: "Suspended user is involved in an active delivery",
          description: "Review the delivery immediately before deciding whether it can safely continue.",
          subject: `${job.pickup_location || "Pickup"} → ${job.destination || "Destination"}`,
          href: "/admin/jobs",
        });
      }
    }

    for (const topup of topupsResult.data || []) {
      if (ageHours(topup.created_at) <= 24) continue;
      issues.push({
        id: `pending-topup-${topup.id}`,
        type: "pending_topup",
        severity: "warning",
        category: "finance",
        title: "Wallet top-up is waiting",
        description: "A pending top-up has not been approved or rejected for more than 24 hours.",
        subject: profilesById.get(topup.user_id)?.full_name || topup.user_id,
        href: "/admin/finance",
      });
    }

    const severityRank = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
    return json({ issues, generatedAt: new Date().toISOString() });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
