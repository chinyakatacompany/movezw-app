import { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { applyTheme, DEFAULT_THEME } from "@/lib/theme";

// Applies the admin-selected app theme (site_content key "site.theme") as
// soon as the app boots, before any route renders — mounted once at the top
// of App.jsx so it covers the landing page and auth screens too, not just
// logged-in dashboards.
export default function ThemeLoader() {
  useEffect(() => {
    // Local-only override for previewing an unreleased theme before it's
    // set live in site_content (which is shared with production) — e.g.
    // http://localhost:5177/?previewTheme=movezwDark. Only read once on
    // boot; the app is a SPA so this stays applied through client-side
    // navigation without needing to repeat it on every page.
    const previewTheme = new URLSearchParams(window.location.search).get("previewTheme");
    if (previewTheme) {
      applyTheme(previewTheme);
      return;
    }
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
