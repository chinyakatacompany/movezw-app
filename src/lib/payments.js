import { supabase } from "@/api/supabaseClient";
import { COMMISSION_RATE } from "@/lib/movezw";

// All wallet/commission/refund/payout mutations run as SECURITY DEFINER
// Postgres functions (fn_*) rather than direct table writes. The database
// only grants clients SELECT on wallets/transactions/payouts/refund_requests
// — this file is a thin wrapper around those RPCs so a user can't bypass the
// server-side balance/commission logic by calling the table API directly.

function unwrapRpc({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// Ensure a wallet exists for a user; return it.
export async function ensureWallet(userId) {
  return unwrapRpc(await supabase.rpc("fn_ensure_wallet", { p_user_id: userId }));
}

// ---- Commission configuration (single record) ----
export async function getCommissionConfig() {
  const { data } = await supabase.from("commission_config").select("*").limit(1);
  if (data?.[0]) return data[0];
  return { rate: COMMISSION_RATE, low_balance_threshold: 5, refund_after_loading_requires_approval: true, wallet_paused: false };
}

export async function updateCommissionSettings({ rate, lowBalanceThreshold, policyNote, walletPaused }, actor) {
  const cfg = await getCommissionConfig();
  const patch = {};
  if (rate != null && !isNaN(Number(rate))) patch.rate = Math.min(0.5, Math.max(0, Number(rate)));
  if (lowBalanceThreshold != null && !isNaN(Number(lowBalanceThreshold))) patch.low_balance_threshold = Number(lowBalanceThreshold);
  if (policyNote != null) patch.cancellation_policy_note = policyNote;
  if (walletPaused != null) patch.wallet_paused = Boolean(walletPaused);
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
  return updated;
}

// ---- Charge commission when the driver collects the cargo ----
export async function chargeCommissionOnCollection({ driverId, request }) {
  return unwrapRpc(await supabase.rpc("fn_charge_commission_on_collection", { p_driver_id: driverId, p_request_id: request.id }));
}

// ---- Job completion: credit full job price, release held commission ----
export async function processJobCompletion({ driverId, request }) {
  return unwrapRpc(await supabase.rpc("fn_process_job_completion", { p_driver_id: driverId, p_request_id: request.id }));
}

// ---- Cancellation refund policy (admin-triggered) ----
export async function processCancellationRefund({ request }) {
  return unwrapRpc(await supabase.rpc("fn_process_cancellation_refund", { p_request_id: request.id }));
}

export async function approveRefundRequest(refundRequestId, _adminId, adminNote = "") {
  return unwrapRpc(await supabase.rpc("fn_approve_refund_request", { p_refund_request_id: refundRequestId, p_admin_note: adminNote }));
}

export async function rejectRefundRequest(refundRequestId, _adminId, adminNote = "") {
  return unwrapRpc(await supabase.rpc("fn_reject_refund_request", { p_refund_request_id: refundRequestId, p_admin_note: adminNote }));
}

// Driver claims an approved refund into their own wallet.
export async function claimRefund({ refundRequestId }) {
  return unwrapRpc(await supabase.rpc("fn_claim_refund", { p_refund_request_id: refundRequestId }));
}

// ---- Top up (lands as 'pending' until an admin approves it) ----
export async function requestTopUp({ amount, method, destination }) {
  return unwrapRpc(await supabase.rpc("fn_request_topup", { p_amount: amount, p_method: method, p_destination: destination }));
}

export async function approveTopUp(transactionId) {
  return unwrapRpc(await supabase.rpc("fn_approve_topup", { p_transaction_id: transactionId }));
}

export async function rejectTopUp(transactionId, adminNote = "") {
  return unwrapRpc(await supabase.rpc("fn_reject_topup", { p_transaction_id: transactionId, p_admin_note: adminNote }));
}
