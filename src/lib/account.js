import { supabase } from "@/api/supabaseClient";

// Self-service account deletion. The edge function derives the caller's
// identity from their own session token (never a client-supplied id), then
// either fully deletes the account or scrubs its personal identifiers in
// place, depending on whether the account has any transaction/message
// history that Postgres won't let a hard delete cascade through -- see
// supabase/functions/delete-account/index.ts. Throws with the server's
// message on any block (active delivery, wallet balance, etc.) so callers
// can show it directly to the user.
export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke("delete-account");
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
