import { supabase } from "@/api/supabaseClient";

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
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      request_id: request.id,
      request_label: label,
      customer_id: request.customer_id,
      driver_id: driverId,
      driver_name: driverName || "Driver",
      customer_name: customerName || request.customer_name || "Customer",
      last_message: "",
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}
