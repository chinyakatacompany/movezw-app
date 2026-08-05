import { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { applyTheme, DEFAULT_THEME } from "@/lib/theme";

// Applies the admin-selected app theme (site_content key "site.theme") as
// soon as the app boots, before any route renders — mounted once at the top
// of App.jsx so it covers the landing page and auth screens too, not just
// logged-in dashboards.
export default function ThemeLoader() {
  useEffect(() => {
    let active = true;
    supabase
      .from("site_content")
      .select("value")
      .eq("key", "site.theme")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Failed to load app theme:", error);
        if (active) applyTheme(data?.value || DEFAULT_THEME);
      });
    return () => { active = false; };
  }, []);

  return null;
}
