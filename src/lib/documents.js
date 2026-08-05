import { supabase } from "@/api/supabaseClient";

// National ID, driver's licence, vehicle registration — real government ID
// documents, so these live in a private bucket (verification-docs), unlike
// profile pictures/cargo photos which stay in the public "documents" bucket
// since those need to be broadly viewable (a customer evaluating a driver's
// offer, other drivers browsing an open request). Stores the bare object
// path, not a public URL — there isn't one, the bucket is private — and
// resolves to a short-lived signed URL only when actually viewed.
export async function uploadVerificationDocument(file) {
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
  const { error } = await supabase.storage.from("verification-docs").upload(path, file);
  if (error) throw error;
  return path;
}

export async function getVerificationDocSignedUrl(path, expirySeconds = 3600) {
  const { data, error } = await supabase.storage.from("verification-docs").createSignedUrl(path, expirySeconds);
  if (error) throw error;
  return data.signedUrl;
}
