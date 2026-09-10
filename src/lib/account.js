import { supabase } from "@/api/supabaseClient";

// Account deletion. With no target id this is self-service. A target id is
// accepted by the Edge Function only after the signed-in caller is verified
// as an admin. The server either fully deletes the account or scrubs its
// personal identifiers in place when operational history must be retained.
// Throws with the server's message on any block (active delivery, wallet
// balance, business ownership, etc.) so callers can show it directly.
export async function deleteAccount(targetUserId) {
  const options = targetUserId ? { body: { targetUserId } } : undefined;
  const { data, error } = await supabase.functions.invoke("delete-account", options);
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch { /* fall back to error.message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
