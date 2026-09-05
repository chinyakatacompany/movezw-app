import { supabase } from "@/api/supabaseClient";

// Find or create an admin <-> user conversation (driver or customer), not
// tied to any transport request. Reuses the same conversations/messages
// tables and RLS as regular customer-driver chats — the admin's own id just
// goes in the customer_id slot and the target user's id in the driver_id
// slot, which conversations_insert_participant already permits regardless
// of the target's actual role (both columns are just plain FKs to
// profiles, not role-checked) — Messages.jsx and Chat.jsx already derive
// "the other party" generically from whichever slot matches auth.uid(), so
// nothing else about the schema or UI needed to change to support this.
export async function getOrCreateAdminConversation({ adminId, adminName, userId, userName }) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("customer_id", adminId)
    .eq("driver_id", userId)
    .is("request_id", null)
    .order("last_message_at", { ascending: false })
    .limit(1);
  if (existing?.[0]) return existing[0];
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      request_id: null,
      request_label: "MoveZW Support",
      customer_id: adminId,
      driver_id: userId,
      driver_name: userName || "User",
      customer_name: adminName || "MoveZW Admin",
      last_message: "",
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}

// Find or create a conversation between a customer and driver for a request.
export async function getOrCreateConversation({ request, driverId, driverName, customerName }) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("request_id", request.id)
    .eq("driver_id", driverId)
    .order("last_message_at", { ascending: false })
    .limit(1);
  if (existing?.[0]) return existing[0];
  const label = `${request.cargo_type || "Delivery"}: ${request.pickup_location} → ${request.destination}`;
  // A driver's quote is not an introduction to the customer. Keep the
  // customer's identity anonymous in newly-created pre-acceptance chats;
  // Chat.jsx resolves the real name from the request after this driver is
  // actually accepted.
  const visibleCustomerName = request.accepted_driver_id === driverId
    ? (customerName || request.customer_name || "Customer")
    : "Customer";
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      request_id: request.id,
      request_label: label,
      customer_id: request.customer_id,
      driver_id: driverId,
      driver_name: driverName || "Driver",
      customer_name: visibleCustomerName,
      last_message: "",
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}
