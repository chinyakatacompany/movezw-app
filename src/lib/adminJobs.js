import { supabase } from "@/api/supabaseClient";
import { STATUS_FLOW, notifyJobStatusChange } from "@/lib/movezw";
import { processJobCompletion } from "@/lib/payments";

export const ADMIN_ACTIVE_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"];

export async function advanceAdminJob(job, nextStatus, actorId) {
  const expectedNext = job.status === "delivered"
    ? "completed"
    : STATUS_FLOW[STATUS_FLOW.indexOf(job.status) + 1];
  if (expectedNext !== nextStatus) {
    throw new Error("This is not the next delivery stage.");
  }
  const { data: changed, error } = await supabase
    .from("transport_requests")
    .update({ status: nextStatus })
    .eq("id", job.id)
    .eq("status", job.status)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!changed) throw new Error("This job changed before the update. Review its current status and try again.");

  if (nextStatus === "completed" && job.accepted_driver_id) {
    try {
      await processJobCompletion({
        driverId: job.accepted_driver_id,
        request: job,
        acceptedPrice: job.accepted_price,
        actorId,
      });
    } catch (paymentError) {
      console.warn("Admin completion payment processing failed", paymentError);
    }
  }
  try { await notifyJobStatusChange(job, nextStatus, actorId); } catch { /* best-effort */ }
}
