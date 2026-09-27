import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Supabase already defaults to these values in a browser, but keeping
    // them explicit prevents a future client upgrade or native WebView
    // configuration from turning a durable login into a session-only one.
    // The refresh token remains in the device's local storage until the
    // user explicitly signs out (or the account/session is revoked).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
