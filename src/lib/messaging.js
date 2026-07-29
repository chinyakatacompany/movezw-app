import { base44 } from "@/api/base44Client";

// Find or create a conversation between a customer and driver for a request.
export async function getOrCreateConversation({ request, driverId, driverName, customerName }) {
  const existing = await base44.entities.Conversation.filter({ request_id: request.id, driver_id: driverId }, "-created_date", 1);
  if (existing[0]) return existing[0];
  const label = `${request.cargo_type || "Delivery"}: ${request.pickup_location} → ${request.destination}`;
  return base44.entities.Conversation.create({
    request_id: request.id,
    request_label: label,
    customer_id: request.customer_id,
    driver_id: driverId,
    driver_name: driverName || "Driver",
    customer_name: customerName || request.customer_name || "Customer",
    last_message: "",
    last_message_at: new Date().toISOString(),
  });
}
