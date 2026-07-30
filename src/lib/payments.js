import { supabase } from "@/api/supabaseClient";
import { COMMISSION_RATE, createNotification, formatMoney } from "@/lib/movezw";

// Ensure a wallet exists for a user; return it.
export async function ensureWallet(userId) {
  const { data: existing } = await supabase.from("wallets").select("*").eq("user_id", userId).limit(1);
  if (existing?.[0]) return existing[0];
  const { data: created, error } = await supabase
    .from("wallets")
    .insert({
      user_id: userId,
      balance: 0,
      pending: 0,
      currency: "USD",
      total_earned: 0,
      total_commission: 0,
      total_paid_out: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}

let _seq = 0;
export function generateInvoiceNumber() {
  _seq = (_seq + 1) % 10000;
  const d = new Date();
  const y = d.getFullYear();
  const stamp = `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `MV-${y}${stamp}-${String(_seq).padStart(4, "0")}`;
}

export async function recordTransaction(wallet, partial) {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      status: "completed",
      ...partial,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Audit log ----
export async function audit(actorId, action, details, extra = {}) {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        actor_id: actorId || null,
        actor_name: extra.actor_name || (actorId ? "User" : "System"),
        action,
        entity_type: extra.entity_type || "",
        entity_id: extra.entity_id || null,
        details,
        reference: extra.reference || generateInvoiceNumber(),
        amount: extra.amount || 0,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch {
    /* best-effort */
  }
}

// ---- Commission configuration (single record) ----
export async function getCommissionConfig() {
  const { data: existing } = await supabase.from("commission_config").select("*").limit(1);
  if (existing?.[0]) return existing[0];
  try {
    const { data: created, error } = await supabase
      .from("commission_config")
      .insert({
        rate: COMMISSION_RATE,
        low_balance_threshold: 5,
        refund_after_loading_requires_approval: true,
        cancellation_policy_note: "100% commission refund if cancelled before cargo loading. After loading, refunds require admin approval.",
      })
      .select()
      .single();
    if (error) throw error;
    return created;
  } catch {
    return { rate: COMMISSION_RATE, low_balance_threshold: 5, refund_after_loading_requires_approval: true };
  }
}

export async function setCommissionRate(rate, actor) {
  const cfg = await getCommissionConfig();
  const r = Math.min(0.5, Math.max(0, Number(rate)));
  let updated = { ...cfg, rate: r };
  if (cfg.id) {
    const { data, error } = await supabase
      .from("commission_config")
      .update({
        rate: r,
        updated_by_id: actor?.id || null,
        cancellation_policy_note: `Commission rate ${(r * 100).toFixed(1)}%. 100% refund if cancelled before loading; after loading, admin approval required.`,
      })
      .eq("id", cfg.id)
      .select()
      .single();
    if (error) throw error;
    updated = data;
  }
  await audit(actor?.id, "commission_rate_update", `Commission rate set to ${(r * 100).toFixed(1)}%`, { entity_id: cfg.id || null });
  return updated;
}

export async function updateCommissionSettings({ rate, lowBalanceThreshold, policyNote }, actor) {
  const cfg = await getCommissionConfig();
  const patch = {};
  if (rate != null && !isNaN(Number(rate))) patch.rate = Math.min(0.5, Math.max(0, Number(rate)));
  if (lowBalanceThreshold != null && !isNaN(Number(lowBalanceThreshold))) patch.low_balance_threshold = Number(lowBalanceThreshold);
  if (policyNote != null) patch.cancellation_policy_note = policyNote;
  patch.updated_by_id = actor?.id || null;
  let updated = { ...cfg, ...patch };
  if (cfg.id) {
    const { data, error } = await supabase.from("commission_config").update(patch).eq("id", cfg.id).select().single();
    if (error) throw error;
    updated = data;
  } else {
    const { data, error } = await supabase
      .from("commission_config")
      .insert({ rate: COMMISSION_RATE, low_balance_threshold: 5, refund_after_loading_requires_approval: true, ...patch })
      .select()
      .single();
    if (error) throw error;
    updated = data;
  }
  await audit(actor?.id, "commission_settings_update", `Commission settings updated (rate ${((patch.rate ?? cfg.rate) * 100).toFixed(1)}%, threshold ${patch.low_balance_threshold ?? cfg.low_balance_threshold})`, { entity_id: cfg.id || null });
  return updated;
}

// ---- Charge commission when the driver collects the cargo (job accepted/started) ----
export async function chargeCommissionOnCollection({ driverId, request, acceptedPrice, actorId }) {
  const cfg = await getCommissionConfig();
  const rate = cfg.rate ?? COMMISSION_RATE;
  const price = Number(acceptedPrice || request?.accepted_price || 0);
  const commission = Math.round(price * rate * 100) / 100;
  if (commission <= 0) return { commission: 0, skipped: true };

  const wallet = await ensureWallet(driverId);
  if ((wallet.balance || 0) < commission) {
    await createNotification(
      driverId,
      "admin",
      "Top up required ⚠️",
      `Your wallet balance is too low to collect this job. A commission of ${formatMoney(commission)} is required. Please top up your wallet.`,
      "/wallet"
    );
    throw new Error(`Insufficient wallet balance. Commission of ${formatMoney(commission)} is required to collect this job. Please top up your wallet.`);
  }

  const invoice = generateInvoiceNumber();
  await recordTransaction(wallet, {
    type: "escrow_hold",
    direction: "out",
    amount: commission,
    method: "wallet",
    gateway: "platform",
    reference: invoice,
    request_id: request?.id,
    commission,
    status: "completed",
    note: `Commission held for ${request?.cargo_type || "job"} (${(rate * 100).toFixed(0)}%)`,
  });

  const { error: walletErr } = await supabase
    .from("wallets")
    .update({
      balance: Math.round((wallet.balance - commission) * 100) / 100,
      pending: Math.round(((wallet.pending || 0) + commission) * 100) / 100,
      total_commission: Math.round(((wallet.total_commission || 0) + commission) * 100) / 100,
    })
    .eq("id", wallet.id);
  if (walletErr) throw walletErr;

  await audit(actorId || driverId, "commission_charged", `Commission ${formatMoney(commission)} held in escrow for job ${request?.id}`, { entity_id: request?.id, amount: commission, reference: invoice });
  await createNotification(
    driverId,
    "admin",
    "Commission held 🔒",
    `${formatMoney(commission)} commission held in escrow for this job. Refunded automatically if cancelled before loading; after loading, refunds need admin approval.`,
    "/wallet"
  );
  return { commission, invoice, wallet };
}

// ---- Job completion: credit full job price, release held commission to platform ----
export async function processJobCompletion({ driverId, request, acceptedPrice, actorId }) {
  const wallet = await ensureWallet(driverId);
  const price = Math.round(Number(acceptedPrice || request?.accepted_price || 0) * 100) / 100;
  const cfg = await getCommissionConfig();
  const rate = cfg.rate ?? COMMISSION_RATE;
  const commission = Math.round(price * rate * 100) / 100;
  const invoice = generateInvoiceNumber();

  await recordTransaction(wallet, {
    type: "credit",
    direction: "in",
    amount: price,
    method: "wallet",
    gateway: "platform",
    reference: invoice,
    request_id: request?.id,
    commission,
    status: "completed",
    note: `Earnings for ${request?.cargo_type || "delivery"}: ${request?.pickup_location} → ${request?.destination}`,
  });

  const held = Math.min(wallet.pending || 0, commission);
  if (held > 0) {
    await recordTransaction(wallet, {
      type: "commission",
      direction: "out",
      amount: held,
      method: "wallet",
      gateway: "platform",
      reference: invoice,
      request_id: request?.id,
      status: "completed",
      note: `Commission released to platform`,
    });
  }

  const { error: walletErr } = await supabase
    .from("wallets")
    .update({
      balance: Math.round((wallet.balance + price) * 100) / 100,
      pending: Math.round(((wallet.pending || 0) - held) * 100) / 100,
      total_earned: Math.round(((wallet.total_earned || 0) + price) * 100) / 100,
    })
    .eq("id", wallet.id);
  if (walletErr) throw walletErr;

  await audit(actorId || driverId, "job_completed", `Job completed. Driver credited ${formatMoney(price)}; commission released ${formatMoney(held)}.`, { entity_id: request?.id, amount: price, reference: invoice });
  await createNotification(driverId, "admin", "Earnings credited 💰", `${formatMoney(price)} has been credited to your wallet for this job.`, "/wallet");
  return { wallet, commission: held, earnings: price, invoice };
}

// ---- Cancellation refund policy ----
// Before cargo loading: nothing was charged, so nothing to refund (100% effectively).
// After loading (collected/in_transit/delivered): commission was charged → create a RefundRequest for admin approval.
export async function processCancellationRefund({ request, actorId }) {
  const driverId = request.accepted_driver_id;
  if (!driverId) return { refundRequested: false };
  const afterLoading = ["collected", "in_transit", "delivered"].includes(request.status);
  if (!afterLoading) return { refundRequested: false };

  const cfg = await getCommissionConfig();
  const rate = cfg.rate ?? COMMISSION_RATE;
  const price = Number(request.accepted_price || 0);
  const commission = Math.round(price * rate * 100) / 100;
  if (commission <= 0) return { refundRequested: false };

  const { data: existing } = await supabase
    .from("refund_requests")
    .select("*")
    .eq("request_id", request.id)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(1);
  if (existing?.[0]) return { refundRequested: true, alreadyExists: true, refundRequestId: existing[0].id };

  const wallet = await ensureWallet(driverId);
  const { data: rr, error: rrErr } = await supabase
    .from("refund_requests")
    .insert({
      request_id: request.id,
      driver_id: driverId,
      wallet_id: wallet.id,
      amount: commission,
      reason: `Cancellation after loading (${request.status}). Requires admin approval.`,
      status: "pending",
      requested_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (rrErr) throw rrErr;
  await audit(actorId, "refund_requested", `Refund of ${formatMoney(commission)} requested (cancelled after loading) for job ${request.id}`, { entity_id: rr.id, amount: commission });
  await createNotification(driverId, "admin", "Refund request submitted", `A commission refund of ${formatMoney(commission)} for your cancelled job is pending admin approval. You'll be notified once approved.`, "/wallet");
  return { refundRequested: true, refundRequestId: rr.id };
}

export async function approveRefundRequest(refundRequestId, adminId, adminNote = "") {
  const { data: rr, error: getErr } = await supabase.from("refund_requests").select("*").eq("id", refundRequestId).single();
  if (getErr) throw getErr;
  if (rr.status !== "pending") throw new Error("Refund request is not pending");
  const { error } = await supabase
    .from("refund_requests")
    .update({
      status: "approved",
      decided_by_id: adminId,
      decided_at: new Date().toISOString(),
      admin_note: adminNote,
    })
    .eq("id", rr.id);
  if (error) throw error;
  await audit(adminId, "refund_approved", `Admin approved refund of ${formatMoney(rr.amount)} for job ${rr.request_id}`, { entity_id: rr.id, amount: rr.amount });
  await createNotification(rr.driver_id, "admin", "Refund approved ✅", `Your commission refund of ${formatMoney(rr.amount)} was approved. Open your wallet to claim it.`, "/wallet");
  return rr;
}

export async function rejectRefundRequest(refundRequestId, adminId, adminNote = "") {
  const { data: rr, error: getErr } = await supabase.from("refund_requests").select("*").eq("id", refundRequestId).single();
  if (getErr) throw getErr;
  const { error } = await supabase
    .from("refund_requests")
    .update({
      status: "rejected",
      decided_by_id: adminId,
      decided_at: new Date().toISOString(),
      admin_note: adminNote,
    })
    .eq("id", rr.id);
  if (error) throw error;
  await audit(adminId, "refund_rejected", `Admin rejected refund of ${formatMoney(rr.amount)} for job ${rr.request_id}`, { entity_id: rr.id, amount: rr.amount });
  await createNotification(rr.driver_id, "admin", "Refund declined", `Your refund request of ${formatMoney(rr.amount)} was declined.`, "/wallet");
  return rr;
}

// Driver claims an approved refund into their own wallet (works with owner-only wallet security).
export async function claimRefund({ refundRequestId, userId }) {
  const { data: rr, error: getErr } = await supabase.from("refund_requests").select("*").eq("id", refundRequestId).single();
  if (getErr) throw getErr;
  if (rr.status !== "approved") throw new Error("Refund is not approved");
  if (rr.driver_id !== userId) throw new Error("This refund does not belong to you");
  const wallet = await ensureWallet(userId);
  const refundAmt = Math.min(wallet.pending || 0, rr.amount);
  const invoice = generateInvoiceNumber();
  if (refundAmt > 0) {
    await recordTransaction(wallet, {
      type: "refund",
      direction: "in",
      amount: refundAmt,
      method: "wallet",
      gateway: "platform",
      reference: invoice,
      request_id: rr.request_id,
      status: "completed",
      note: `Commission refunded (admin approved)`,
    });
    const { error: walletErr } = await supabase
      .from("wallets")
      .update({
        balance: Math.round((wallet.balance + refundAmt) * 100) / 100,
        pending: Math.round(((wallet.pending || 0) - refundAmt) * 100) / 100,
      })
      .eq("id", wallet.id);
    if (walletErr) throw walletErr;
  }
  const { error: rrErr } = await supabase
    .from("refund_requests")
    .update({ status: "paid", admin_note: `${rr.admin_note || ""} | Claimed by driver.`.trim() })
    .eq("id", rr.id);
  if (rrErr) throw rrErr;
  await audit(userId, "refund_claimed", `Driver claimed refund of ${formatMoney(refundAmt)} for job ${rr.request_id}`, { entity_id: rr.id, amount: refundAmt, reference: invoice });
  await createNotification(userId, "admin", "Refund claimed 💸", `${formatMoney(refundAmt)} refunded to your wallet.`, "/wallet");
  return { refundAmt };
}

// ---- Payout (driver → external) ----
export async function requestPayout({ driverId, amount, method, destination }) {
  const wallet = await ensureWallet(driverId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (amt <= 0) throw new Error("Enter a valid amount");
  if (amt > wallet.balance) throw new Error("Amount exceeds available balance");
  const invoice = generateInvoiceNumber();
  const tx = await recordTransaction(wallet, {
    type: "payout",
    direction: "out",
    amount: amt,
    method,
    gateway: "manual",
    reference: invoice,
    status: "pending",
    note: `Payout to ${destination || method}`,
  });
  const { data: payout, error: payoutErr } = await supabase
    .from("payouts")
    .insert({
      driver_id: driverId,
      wallet_id: wallet.id,
      amount: amt,
      status: "pending",
      method,
      destination,
      transaction_id: tx.id,
    })
    .select()
    .single();
  if (payoutErr) throw payoutErr;
  const { error: walletErr } = await supabase
    .from("wallets")
    .update({
      balance: Math.round((wallet.balance - amt) * 100) / 100,
      total_paid_out: Math.round((wallet.total_paid_out + amt) * 100) / 100,
    })
    .eq("id", wallet.id);
  if (walletErr) throw walletErr;
  await audit(driverId, "payout_requested", `Payout of ${formatMoney(amt)} to ${method} requested`, { entity_id: payout.id, amount: amt, reference: invoice });
  return { payout, tx };
}

// ---- Top up (placeholder gateway auto-confirms) ----
export async function requestTopUp({ userId, amount, method, destination }) {
  const wallet = await ensureWallet(userId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (amt <= 0) throw new Error("Enter a valid amount");
  const invoice = generateInvoiceNumber();
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: "topup",
      direction: "in",
      amount: amt,
      status: "pending",
      method,
      gateway: method,
      reference: invoice,
      note: `Top up via ${method}${destination ? ` (${destination})` : ""}`,
    })
    .select()
    .single();
  if (txErr) throw txErr;
  // Placeholder gateway: auto-confirm
  const { error: confirmErr } = await supabase
    .from("transactions")
    .update({ status: "completed", gateway_ref: `SIM-${invoice}` })
    .eq("id", tx.id);
  if (confirmErr) throw confirmErr;
  const { error: walletErr } = await supabase
    .from("wallets")
    .update({ balance: Math.round((wallet.balance + amt) * 100) / 100 })
    .eq("id", wallet.id);
  if (walletErr) throw walletErr;
  await audit(userId, "wallet_topup", `Top up of ${formatMoney(amt)} via ${method}`, { entity_id: tx.id, amount: amt, reference: invoice });
  await createNotification(userId, "admin", "Wallet topped up 💳", `${formatMoney(amt)} added via ${method}. Ref: ${invoice}`, "/wallet");
  return { tx };
}

// Legacy alias kept for any older callers.
export async function placeholderPayment({ userId, amount, method, type = "topup", note }) {
  const wallet = await ensureWallet(userId);
  const amt = Math.round(Number(amount) * 100) / 100;
  const invoice = generateInvoiceNumber();
  const { data: tx, error } = await supabase
    .from("transactions")
    .insert({
      wallet_id: wallet.id,
      user_id: userId,
      type,
      direction: type === "topup" || type === "credit" || type === "escrow_release" ? "in" : "out",
      amount: amt,
      status: "pending",
      method,
      gateway: method,
      reference: invoice,
      note: note || `Placeholder ${type} via ${method}`,
    })
    .select()
    .single();
  if (error) throw error;
  return tx;
}
